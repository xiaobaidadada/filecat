import React, {useEffect, useState} from 'react'
import {Column, Dashboard, Row, FlexContainer, TextLine, RowColumn} from "../../../meta/component/Dashboard";
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import CircleChart from "../../../meta/component/CircleChart";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {DiskDevicePojo, DiskFilePojo, staticSysPojo, SysPojo} from "../../../../common/req/sys.pojo";
import {sysHttp} from "../../util/config";
import Header from "../../../meta/component/Header";
import {ActionButton, ButtonLittle, ButtonLittleStatus, ButtonText} from "../../../meta/component/Button";
import {InputText} from "../../../meta/component/Input";
import {Table} from "../../../meta/component/Table";
import {RCode} from "../../../../common/Result.pojo";
import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {SysSoftware} from "../../../../common/req/setting.req";
import {NotyFail} from "../../util/noty";
import {DiskCheck} from "./info/DiskCheck";
import {DiskMount} from "./info/DiskMount";
import {SysEnum} from "../../../../common/req/user.req";


let real_time_p = true;
export function Sys(props) {
    const {t} = useTranslation();

    const diskheaders = [t("名字"), t("厂商名称"), t("类型"), t("容量"),];
    const filediskheaders = [t("名字"), t("物理硬盘"), t("文件系统类型"), t("挂载位置"), t("总容量"), t("剩余容量")];
    const [userInfo, setUserInfo] = useRecoilState($stroe.user_base_info);

    const [memPercentage, setmemPercentage] = useState(0);
    const [memLeft, setMemLeft] = useState(0)
    const [memTotal, setMemTotal] = useState(0)
    const [currentLoad, setCurrentLoad] = useState(0)
    const [sys, setSys] = useState({} as any)
    const [base, setBase] = useState(false)
    const [disk, setDisk] = useState(false)
    const [fileDisk, setFileDisk] = useState(false)
    const [real_time, set_real_time] = useState(real_time_p);

    const [diskList, setDiskList] = useState([]);
    const [fileDiskList, setFileDiskList] = useState([]);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const [disk_check, set_disk_check] = useRecoilState($stroe.disk);

    const  get_real_time_info = async ()=>{
        if (!real_time_p) {
            ws.unConnect();
            return;
        }
        const data = new WsData(CmdType.sys_get);
        await ws.send(data)
        ws.addMsg(CmdType.sys_getting, (wsData: WsData<SysPojo>) => {
            setCurrentLoad(wsData.context?.cpu_currentLoad)
            const memLeft = wsData.context?.memLeft;
            const memTotal = wsData.context?.memTotal;
            setMemLeft(memLeft);
            setMemTotal(memTotal);
            setmemPercentage(((memTotal - memLeft) / memTotal) * 100);
        })

        // ws.subscribeUnconnect(init);
    }
    const init = async () => {
        await get_real_time_info();
    }
    const getBase = async () => {
        const rsq1 = await sysHttp.get("base");

        if (rsq1.code === RCode.Sucess) {
            const data: staticSysPojo = rsq1.data;
            setSys(data)
        }
    }
    const getDisk = async () => {
        const rsq2 = await sysHttp.get("disk");
        if (rsq2.code === RCode.Sucess) {
            const data: DiskDevicePojo[] = rsq2.data;
            const list: any[][] = [];
            let have_smartmontools = true;
            if (!user_base_info.sysSoftWare || !user_base_info.sysSoftWare[SysSoftware.smartmontools] || !user_base_info.sysSoftWare[SysSoftware.smartmontools].installed) {
                have_smartmontools = false;
            }
            for (const disk of data ?? []) {
                list.push([<TextTip context={disk.name}/>, disk.typeName, disk.type, disk.total,
                    <ActionButton icon={"health_and_safety"} title={t("查看健康信息")} onClick={() => {
                        if (!have_smartmontools) {
                            NotyFail("没有安装smartmontools")
                            return;
                        }
                        set_disk_check({type:"check",data:disk});
                    }}/>
                ]);
            }
            setDiskList(list);
        }
    }
    const getFileDisk = async () => {
        const rsq3 = await sysHttp.get("filedisk");
        if (rsq3.code === RCode.Sucess) {
            const data: DiskFilePojo[] = rsq3.data;
            const list: any[][] = [];
            for (const disk of data ?? []) {
                list.push([<TextTip context={disk.name}/>, <TextTip context={disk.device_name}/>, disk.fsType,
                    <TextTip context={disk.mount}/>, disk.total, disk.available]);
            }
            setFileDiskList(list);
        }
    }
    useEffect(() => {
        init();
        return () => {
            (async () => {
                if (ws.isAilive()) {
                    ws.setPromise(async (resolve) => {
                        await ws.unConnect();
                        resolve();
                    })

                }
            })();
        }
    }, []);
    return <div>

        <Header >
            {userInfo.sys === SysEnum.linux && (<ActionButton icon={"sd_card"} title={"硬盘挂载"} onClick={()=>{
                set_disk_check({type:"mount"});
            }}/>)}
            <ButtonLittleStatus defaultStatus={false} text={t("基本信息")} clickFun={(v) => {
                setBase(v)
                if (v) {
                    getBase();
                }
            }}/>
            <ButtonLittleStatus defaultStatus={false} text={t("物理硬盘")} clickFun={(v) => {
                setDisk(v);
                if (v) {
                    getDisk();
                }
            }}/>
            <ButtonLittleStatus defaultStatus={false} text={t("文件硬盘")} clickFun={(v) => {
                setFileDisk(v)
                if (v) {
                    getFileDisk();
                }
            }}/>
            <ButtonLittleStatus defaultStatus={real_time} text={t("实时信息")} clickFun={(v) => {
                set_real_time(v)
                real_time_p = v;
                get_real_time_info();
            }}/>
        </Header>
        <Dashboard>
            {real_time &&
                <Row>
                    <Column widthPer={33}>
                        <Card title={t("内存")}>
                            <Row>
                                <Column>
                                    <CircleChart percentage={memPercentage}/>
                                </Column>
                                <Column>
                                    <Row>
                                        <Column widthPer={100}>
                                            <div>
                                                <TextLine left={t("总容量")} center={`${memTotal}G`}/>
                                            </div>
                                        </Column>
                                        <Column widthPer={100}>
                                            <TextLine left={t("剩余")} center={`${memLeft}G`}/>
                                        </Column>
                                    </Row>
                                </Column>
                            </Row>
                        </Card>
                    </Column>
                    <Column widthPer={33}>
                        <Card title={"cpu"}>
                            <Row>
                                <Column>
                                    <CircleChart percentage={currentLoad}/>
                                </Column>
                                <Column>
                                    <Row>
                                        <TextLine left={t("使用率")} center={currentLoad}/>
                                    </Row>
                                </Column>
                            </Row>
                        </Card>
                    </Column>
                </Row>}
            <Row>
                {base && <Column>
                    <Card title={t("基本信息")}>
                        <TextLine left={t("总内存")} right={sys.mem_total}/>
                        <TextLine left={`cpu ${t("制造商")}`} right={sys.cpu_manufacturer}/>
                        <TextLine left={`cpu ${t("品牌")}`} right={sys.cpu_brand}/>
                        <TextLine left={`cpu ${t("逻辑核心")}`} right={sys.cpu_core_num}/>
                        <TextLine left={`cpu ${t("物理核心")}`} right={sys.cpu_phy_core_num}/>
                        <TextLine left={`cpu ${t("最大")}hz`} right={sys.cpu_speed_hz}/>
                        <TextLine left={`当前系统:pid;ppid`} right={sys.pid_ppid}/>
                    </Card>
                </Column>}
                {disk && <Column>
                    <CardFull title={t(`物理硬盘`)}>
                        <Table headers={diskheaders} rows={diskList} width={"10rem"}/>
                    </CardFull>
                </Column>}
                {fileDisk && <Column>
                    <CardFull title={t(`文件硬盘`)}>
                        <Table headers={filediskheaders} rows={fileDiskList} width={"10rem"}/>
                    </CardFull>
                </Column>}
            </Row>
        </Dashboard>
        {disk_check && disk_check.type === "check" && <DiskCheck {...disk_check.data}/>}
        {disk_check && disk_check.type === "mount" && <DiskMount />}
    </div>
}
