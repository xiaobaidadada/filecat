import {useTranslation} from "react-i18next";
import React, {useEffect, useState} from "react";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {CmdType, WsData} from "../../../../../common/frame/WsData";
import {ws} from "../../../util/ws";
import {DiskCheckInfo, DiskDevicePojo, DiskFilePojo, staticSysPojo, SysPojo} from "../../../../../common/req/sys.pojo";
import {sysHttp} from "../../../util/config";
import {RCode} from "../../../../../common/Result.pojo";
import {SysSoftware} from "../../../../../common/req/setting.req";
import {Card, CardFull, StatusCircle, TextTip} from "../../../../meta/component/Card";
import {ActionButton, ButtonLittle, ButtonLittleStatus} from "../../../../meta/component/Button";
import {NotyFail} from "../../../util/noty";
import Header from "../../../../meta/component/Header";
import {Column, Dashboard, FullScreenContext, Row, TextLine} from "../../../../meta/component/Dashboard";
import CircleChart from "../../../../meta/component/CircleChart";
import {Table} from "../../../../meta/component/Table";
import {FullScreenDiv} from "../../../../meta/component/Dashboard";
import {InputText} from "../../../../meta/component/Input";

export function DiskCheck(props: DiskDevicePojo) {
    const {t} = useTranslation();
    const [disk_check, set_disk_check] = useRecoilState($stroe.disk);
    const [info, set_info] = useState({} as DiskCheckInfo);
    const [list,set_list] = useState([]);

    const diskheaders = [t("名字"), t("当前值"), t("历史最低"), t("临界值"),];


    const init = async () => {
        const rsq2 = await sysHttp.post("sys/disk/info",{name:props.name});
        if (rsq2.code === RCode.Sucess) {
            const list:any[][] = [];

            for (const v of rsq2.data.ata_smart_attributes ??[]) {
                let color ;
                if (v[1] >= v[2]) {
                    color = "var(--icon-green)";
                } else if(v[1] <= v[3]) {
                    color = "var(--icon-red)";
                }
                v[0] = (<span
                style={{
                    color:color
                }}
                >{t(v[0])}</span>);
                list.push(v);
            }
            set_list(rsq2.data.ata_smart_attributes)
            set_info(rsq2.data);
        }
    }

    useEffect(() => {
        init();
    }, [info]);
    return <div>
        <Header>
            <ActionButton icon={"close"} title={t("关闭")} onClick={() => {
                set_disk_check({});
            }}/>
        </Header>
        <FullScreenDiv isFull={true} more={true}>
            <FullScreenContext>
                <Row>
                    <Column widthPer={30}>
                        <Dashboard>
                            <Card title={t("基本信息")}>
                                <TextLine left={t("名字")} right={props.name}/>
                                <TextLine left={t("厂商名称")} right={props.typeName}/>
                                <TextLine left={t("类型")} right={props.type}/>
                                <TextLine left={t("容量")} right={props.total}/>
                            </Card>
                        </Dashboard>
                        <Dashboard>
                            <Card title={t("物理信息")}>
                                <TextLine left={t("是否健康")} right={info.smart_status === true ? "是":"否"}/>
                                <TextLine left={t("设备型号")} right={info.model_name}/>
                                <TextLine left={t("序列号")} right={info.serial_number}/>
                                <TextLine left={t("固件版本")} right={info.firmware_version}/>
                                <TextLine left={t("转速(每分钟)")} right={info.rotation_rate}/>
                                <TextLine left={t("通电时长(小时)")} right={info.power_on_time_hours}/>
                                <TextLine left={t("通电次数")} right={info.power_cycle_count}/>
                                <TextLine left={t("温度(°C)")} right={info.temperature}/>
                                <TextLine left={t("通信协议")} right={info.device_protocol}/>
                            </Card>
                        </Dashboard>
                    </Column>
                    <Column widthPer={50}>
                        <Dashboard>
                            <CardFull title={t("SMART详细信息")} >
                                <Table headers={diskheaders} rows={list} width={"10rem"}/>
                            </CardFull>
                        </Dashboard>
                    </Column>
                </Row>
            </FullScreenContext>
        </FullScreenDiv>
    </div>
}