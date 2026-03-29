import React, {useEffect, useState} from 'react'
import {tcpProxy} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail, NotySucess} from "../../util/noty";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card, StatusCircle, TextTip} from "../../../meta/component/Card";
import {InputRadio, InputText} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows, Table} from "../../../meta/component/Table";
import {VirClientPojo} from "../../../../common/req/net.pojo";
import {useTranslation} from "react-i18next";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {
    tcp_proxy_bridge_fig_item,
    tcp_proxy_client_fig,
    tcp_proxy_server_client
} from "../../../../common/req/common.pojo";

export function TcpProxyClient(props) {
    const { t } = useTranslation();


    const [serverIp, setServerIp] = useState("");
    const [client_name, set_client_name] = useState("");
    const [serverPort, setServerPort] = useState(undefined);
    const [isOpen,setIsOpen] = useState(false);
    // const [isUdp, setIsUdp] = useState(false);
    const [key,setKey] = useState("");
    const [connet_state,set_connet_state] = useState<boolean>(false);

    const [client_proxy_list,set_client_proxy_list] = useState<{
        client_proxy_port:number,
        client_proxy_host:string
    }[]>([]);
    const [bridge_list,set_bridge_list] = useState<tcp_proxy_bridge_fig_item[]>([]);

    const client_headers = ["index","host","port"]
    const client_bridge_headers = [t("序号"),t("服务端口"), t("转发客户端名称") ];


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

        const result1 = await tcpProxy.get("client_tcp_proxy_get");
        if (result1.code === RCode.Success) {
            set_client_proxy_list(result1.data)
        }

        const result2 = await tcpProxy.get("client_bridge_get_all_fig");
        if (result2.code === RCode.Success) {
            set_bridge_list(result2.data)
        }

    }

    useEffect(() => {

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
                    <InputText placeholder={`${t("服务器")}port`} value={serverPort} handleInputChange={(d)=>{setServerPort(d)}}/>
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
                    <Table headers={client_headers} rows={client_proxy_list.map((item, index) => {
                        const new_list = [
                            <p>{index}</p>,
                            <TextTip>{item.client_proxy_host}</TextTip>,
                            <TextTip>{item.client_proxy_port}</TextTip>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </Card>
            </Column>
            <Column>

                <Card title={"桥接服务端口列表"} >
                    <Table headers={client_bridge_headers} rows={bridge_list.map((item, index) => {
                        const new_list = [
                            <p>{index}</p>,
                            <TextTip>{item.server_port}</TextTip>,
                            <TextTip>{item.client_name}</TextTip>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </Card>
            </Column>

        </Row>
    </div>
}
