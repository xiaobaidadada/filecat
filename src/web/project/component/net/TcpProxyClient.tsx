import React, {useEffect, useState} from 'react'
import {tcpProxy} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail, NotySucess} from "../../util/noty";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card, StatusCircle} from "../../../meta/component/Card";
import {InputRadio, InputText} from "../../../meta/component/Input";
import {ButtonText} from "../../../meta/component/Button";
import {Rows} from "../../../meta/component/Table";
import {VirClientPojo} from "../../../../common/req/net.pojo";
import {useTranslation} from "react-i18next";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {tcp_proxy_client_fig} from "../../../../common/req/common.pojo";

export function TcpProxyClient(props) {
    const { t } = useTranslation();


    const [serverIp, setServerIp] = useState("");
    const [client_name, set_client_name] = useState("");
    const [serverPort, setServerPort] = useState(undefined);
    const [isOpen,setIsOpen] = useState(false);
    // const [isUdp, setIsUdp] = useState(false);
    const [key,setKey] = useState("");
    const [connet_state,set_connet_state] = useState<boolean>(false);


    useEffect(() => {
        const init = async ()=>{
            const result = await tcpProxy.get("client_get");
            if (result.code !== RCode.Success) {
                return;
            }
            const data = result.data as tcp_proxy_client_fig;
            setServerPort(data.serverPort);
            setServerIp(data.serverIp);
            setKey(data.key);
            setIsOpen(data.open);
            set_client_name(data.client_name);
            if(data.open) {
                const data = new WsData(CmdType.tcp_proxy_client_status);
                const r = await ws.send(data);
                if(r.code !== RCode.Success)  return
                const state = r.context.status;
                console.log(r)
                set_connet_state(state);
                ws.addMsg(CmdType.tcp_proxy_client_status,(data)=>{
                    set_connet_state(data.context.status);
                })
            }
        }
        init();
    }, []);
    const save =async ()=>{
        const pojo = new VirClientPojo();

        pojo.key = key;
        pojo.serverIp = serverIp;
        pojo.serverPort = parseInt(serverPort);
        pojo.open = isOpen;
        pojo.client_name = client_name;
        // pojo.model = isUdp?VirServerEnum.udp:VirServerEnum.tcp;
        const result = await tcpProxy.post("client_save", pojo);
        if (result.code !== RCode.Success) {
            NotyFail("网络错误")
            return;
        }
        NotySucess("保存成功")
    }


    return <div>
        <Row>

            <Column>
                <Card title={""} rightBottomCom={<ButtonText text={t('保存')} clickFun={save}/>} titleCom={<div>{t("连接状态")}<StatusCircle ok={connet_state} /></div>}>

                    <InputText placeholder={`${t("服务器")}ip`} value={serverIp} handleInputChange={(d)=>{setServerIp(d)}}/>
                    <InputText placeholder={`${t("服务器")}part`} value={serverPort} handleInputChange={(d)=>{setServerPort(d)}}/>
                    <InputText placeholder={"名称 "} value={client_name} handleInputChange={(d)=>{set_client_name(d)}}/>
                    <InputText placeholder={"key "} value={key} handleInputChange={(d)=>{setKey(d)}}/>
                    <form>
                        {t("状态")}
                        <Rows isFlex={true} columns={[
                            <InputRadio value={1} context={t("开启")} selected={isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>,
                            <InputRadio value={1} context={t("关闭")} selected={!isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>
                        ]}/>
                    </form>
                </Card>
                <Card title={"转发列表"} >

                </Card>
            </Column>

        </Row>
    </div>
}
