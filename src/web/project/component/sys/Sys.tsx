import React, {useEffect, useState} from 'react'
import { Column, Dashboard, Row, FlexContainer, TextLine, RowColumn} from "../../../meta/component/Dashboard";
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import CircleChart from "../../../meta/component/CircleChart";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {DiskDevicePojo, DiskFilePojo, staticSysPojo, SysPojo} from "../../../../common/req/sys.pojo";
import {sysHttp} from "../../util/config";
import Header from "../../../meta/component/Header";
import {ActionButton, ButtonLittle, ButtonLittleStatus} from "../../../meta/component/Button";
import {InputText} from "../../../meta/component/Input";
import {Table} from "../../../meta/component/Table";
import {RCode} from "../../../../common/Result.pojo";
import {useTranslation} from "react-i18next";


export function Sys(props) {
    const { t } = useTranslation();

    const diskheaders= [t("名字"),t("厂商名称"),  t("类型"), t("容量"), ];
    const filediskheaders= [t("名字"),t("物理硬盘"),  t("文件系统类型"), t("挂载位置"),t("总容量"),t("剩余容量") ];

    const [memPercentage, setmemPercentage] = useState(0);
    const [memLeft,setMemLeft] = useState(0)
    const [memTotal,setMemTotal] = useState(0)
    const [currentLoad,setCurrentLoad] = useState(0)
    const [sys,setSys] = useState({} as any)
    const [base,setBase] = useState(false)
    const [disk,setDisk] = useState(false)
    const [fileDisk,setFileDisk] = useState(false)

    const [diskList, setDiskList] = useState([]);
    const [fileDiskList, setFileDiskList] = useState([]);

    const init = async () => {
        const data = new WsData(CmdType.sys_get);
        await ws.send(data)
        ws.addMsg(CmdType.sys_getting,(wsData:WsData<SysPojo>)=>{
            setCurrentLoad(wsData.context?.cpu_currentLoad)
            const memLeft = wsData.context?.memLeft;
            const memTotal = wsData.context?.memTotal;
            setMemLeft(memLeft);
            setMemTotal(memTotal);
            setmemPercentage(((memTotal-memLeft)/memTotal)*100)
        })
        // ws.subscribeUnconnect(init);

    }
    const getBase = async ()=>{
        const rsq1 = await sysHttp.get("base");

        if (rsq1.code === RCode.Sucess) {
            const data :staticSysPojo = rsq1.data;
            setSys(data)
        }
    }
    const getDisk = async ()=>{
        const rsq2 = await sysHttp.get("disk");
        if (rsq2.code === RCode.Sucess) {
            const data :DiskDevicePojo[] = rsq2.data;
            const list:any[][] = [];
            for (const disk of data??[]) {
                list.push([<TextTip context={disk.name}/>,disk.typeName,disk.type,disk.total]);
            }
            setDiskList(list);
        }
    }
    const getFileDisk = async ()=>{
        const rsq3= await sysHttp.get("filedisk");
        if (rsq3.code === RCode.Sucess) {
            const data :DiskFilePojo[] = rsq3.data;
            const list:any[][] = [];
            for (const disk of data??[]) {
                list.push([<TextTip context={disk.name}/>,<TextTip context={disk.device_name}/>,disk.fsType,<TextTip context={disk.mount}/>,disk.total,disk.available]);
            }
            setFileDiskList(list);
        }
    }
    useEffect( () => {
        init();
        return ()=>{
            (async ()=>{
                if (ws.isAilive()) {
                    ws.setPromise(async (resolve)=>{
                        await ws.unConnect();
                        resolve();
                    })

                }
            })();
        }
    }, []);
    return <div>
        <Header>
            <ButtonLittleStatus defaultStatus={false} text={t("基本信息")} clickFun={(v)=>{
                setBase(v)
                if(v) {
                    getBase();
                }
            }}/>
            <ButtonLittleStatus defaultStatus={false} text={t("物理硬盘")} clickFun={(v)=>{
                setDisk(v);
                if (v) {
                    getDisk();
                }
            }}/>
            <ButtonLittleStatus defaultStatus={false} text={t("文件硬盘")} clickFun={(v)=>{
                setFileDisk(v)
                if (v) {
                    getFileDisk();
                }
            }}/>
        </Header>
        <Dashboard>
        <Row>
            <Column widthPer={33}>
                <Card title={t("内存")}>
                    <Row>
                        <Column>
                            <CircleChart percentage={memPercentage}  />
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
                            <CircleChart percentage={currentLoad}  />
                        </Column>
                        <Column>
                            <Row>
                                <TextLine left={t("使用率")} center={currentLoad}/>
                            </Row>
                        </Column>
                    </Row>
                </Card>
            </Column>

        </Row>
            <Row>
                {base && <Column>
                    <Card title={t("基本信息")}>
                        <TextLine left={t("总内存")} right={sys.mem_total}/>
                        <TextLine left={`cpu ${t("制造商")}`} right={sys.cpu_manufacturer}/>
                        <TextLine left={`cpu ${t("品牌")}`} right={sys.cpu_brand}/>
                        <TextLine left={`cpu ${t("逻辑核心")}`} right={sys.cpu_core_num}/>
                        <TextLine left={`cpu ${t("物理核心")}`} right={sys.cpu_phy_core_num}/>
                        <TextLine left={`cpu ${t("最大")}hz`} right={sys.cpu_speed_hz}/>
                    </Card>
                </Column>}
                {disk && <Column >
                    <CardFull title={t(`物理硬盘`)} >
                        <Table headers={diskheaders} rows={diskList} width={"10rem"}/>
                    </CardFull>
                </Column>}
                {fileDisk && <Column >
                    <CardFull title={t(`文件硬盘`)} >
                        <Table headers={filediskheaders} rows={fileDiskList} width={"10rem"}/>
                    </CardFull>
                </Column>}
            </Row>
    </Dashboard>
        </div>
}
