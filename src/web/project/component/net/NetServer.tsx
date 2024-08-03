import React, {useEffect, useRef, useState} from 'react'
import {ddnsHttp, netHttp} from "../../util/config";
import {NotySucess,NotyFail} from "../../util/noty";
import {RCode} from "../../../../common/Result.pojo";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {InputRadio, InputText} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows, Table} from "../../../meta/component/Table";
import {VirServerEnum, VirServerPojo} from "../../../../common/req/net.pojo";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {useTranslation} from "react-i18next";

export function NetServer(props) {
    const { t } = useTranslation();

    const [serverPort, setServerPort] = useState("");
    const [isOpen,setIsOpen] = useState(false);
    const [isUdp, setIsUdp] = useState(false);
    const [key,setKey] = useState("");
    const [headers, setHeaders] = useState([t(`${t("虚拟")}ip`), `${t("物理")}ip`,t("在线状态")]);
    const [rows, setRows] = useState([]);

    useEffect(() => {
        const getItems = async ()=>{
            const data = new WsData(CmdType.vir_net_serverIno_get);
            const list = await ws.send(data);
            setRows(list);
        }
        getItems();
        const init = async ()=>{
            const result = await netHttp.get("vir/server/get");
            if (result.code !== RCode.Sucess) {
                return;
            }
            const data = result.data as VirServerPojo;
            setServerPort(data.port);
            setKey(data.key);
            setIsUdp(data.model===VirServerEnum.udp);
            setIsOpen(data.open);
            setInterval(getItems,1000 * 30)
        }
        init();
    }, []);
    const save = async ()=>{
        const pojo = new VirServerPojo();
        pojo.open = isOpen;
        pojo.model = isUdp?VirServerEnum.udp:VirServerEnum.tcp;
        pojo.key = key;
        pojo.port = parseInt(serverPort);
        const result = await netHttp.post("vir/server/save", pojo);
        if (result.code !== RCode.Sucess) {
            NotyFail("网络错误")
            return;
        }
        NotySucess("保存成功")
    }
    return <div>
        <Row>

            <Column>
                <Card title={""} rightBottomCom={<ButtonText text={t('保存')} clickFun={save}/>}>

                    <InputText placeholder={"port"} value={serverPort} handleInputChange={(d)=>{setServerPort(d)}}/>
                    <InputText placeholder={"key "} value={key} handleInputChange={(d)=>{setKey(d)}}/>
                    <form>
                        {t("状态")}:<Rows isFlex={true} columns={[
                        <InputRadio value={1} context={t("开启")} selected={isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>,
                        <InputRadio value={1} context={t("关闭")} selected={!isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>
                    ]}/>
                    </form>
                    <form>
                        {t("模式")}
                        <Rows isFlex={true} columns={[
                            <InputRadio value={1} context={`tcp${t("流量转发")}`} selected={!isUdp}  onchange={()=>{setIsUdp(!isUdp)}}/>,
                            <InputRadio value={1} context={`udp${t("点对点")}`} selected={isUdp}  onchange={()=>{setIsUdp(!isUdp)}}/>
                        ]}/>
                    </form>

                </Card>
                <Card title={""} >
                    <Table headers={headers} rows={[]} width={"10rem"}/>
                </Card>
            </Column>
        </Row>
    </div>
}
