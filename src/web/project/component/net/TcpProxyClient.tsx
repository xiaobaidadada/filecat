import React, {useEffect, useState} from 'react'
import {tcpProxy} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail, NotySucess} from "../../util/noty";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card, StatusCircle, TextTip} from "../../../meta/component/Card";
import {InputRadio, InputText, Select} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows, Table} from "../../../meta/component/Table";
import {VirClientPojo} from "../../../../common/req/net.pojo";
import {useTranslation} from "react-i18next";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {
    tcp_proxy_bridge_fig_item, tcp_proxy_client_all_fig,
    tcp_proxy_client_fig,
    tcp_proxy_server_client
} from "../../../../common/req/common.pojo";
import {generateRandomHash} from "../../../../common/StringUtil";

export function TcpProxyClient(props) {
    const { t } = useTranslation();


    // const [serverIp, setServerIp] = useState("");
    // const [client_name, set_client_name] = useState("");
    // const [serverPort, setServerPort] = useState(undefined);
    // const [isOpen,setIsOpen] = useState(false);
    // // const [isUdp, setIsUdp] = useState(false);
    // const [key,setKey] = useState("");
    // const [connet_state,set_connet_state] = useState<boolean>(false);
    const [clients,set_clients] = useState<tcp_proxy_client_fig[]>([]);

    const [client_proxy_list,set_client_proxy_list] = useState<{
        client_proxy_port:number,
        client_proxy_host:string
    }[]>([]);
    const [bridge_list,set_bridge_list] = useState<tcp_proxy_bridge_fig_item[]>([]);

    // const client_headers = ["index","host","port"]
    const client_bridge_headers = [t("序号"),t("服务端口"), t("转发客户端名称") ];

    const all_client_headers = [t("序号"),t("port"), t("host"),t("名称"),t("key"),t("在线"),t("开启"),t("备注") ];

    const init = async ()=>{
        const result = await tcpProxy.get("client_get");
        if (result.code === RCode.Success) {
            const data = result.data as tcp_proxy_client_all_fig;
            set_clients(data.list)
        }

        // setServerPort(data.serverPort);
        // setServerIp(data.serverIp);
        // setKey(data.key);
        // setIsOpen(data.open);
        // set_client_name(data.client_name);
        // if(data.open) {
        //     const data1 = new WsData(CmdType.tcp_proxy_client_status);
        //     const r1 = await ws.send(data1);
        //     if(r1.code === RCode.Success)  {
        //         const state = r1.context.status;
        //         // console.log(r)
        //         set_connet_state(state);
        //
        //     }
        // }

        // const result1 = await tcpProxy.get("client_tcp_proxy_get");
        // if (result1.code === RCode.Success) {
        //     set_client_proxy_list(result1.data)
        // }

        const result2 = await tcpProxy.get("client_bridge_get_all_fig");
        if (result2.code === RCode.Success) {
            set_bridge_list(result2.data)
        }

    }

    useEffect(() => {

        init();
        ws.sendData(CmdType.tcp_proxy_client_status,{}).then(()=>{
            ws.addMsg(CmdType.tcp_proxy_client_status,(data)=>{
                init()
            })
        })

    }, []);
    const del_client = async (index:number) => {
        const result = await tcpProxy.post("client_del", {index});
        if (result.code !== RCode.Success) {
            NotyFail("网络错误")
            return;
        }
        NotySucess("保存成功")
        init()
    }
    const save =async (item:tcp_proxy_client_fig)=>{
        const pojo = new tcp_proxy_client_fig();
        // pojo.is_new = item.is_new
        pojo.index = item.index

        pojo.key = item.key;
        pojo.serverIp = item.serverIp;
        pojo.serverPort = item.serverPort;
        pojo.open = item.open;
        pojo.client_name = item.client_name;
        pojo.client_num_id = item.client_num_id;
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

            <Column widthPer={60}>

                <Card title={""} rightBottomCom={<ButtonText text={t('保存')} clickFun={()=>{
                    clients[0].index = 0
                    save(clients[0])
                }}/>} titleCom={<div>{t("连接状态")}<StatusCircle ok={!!clients[0]?.status} /></div>}>

                    <InputText placeholder={`${t("服务器")}ip`} value={clients[0]?.serverIp} handleInputChange={(d)=>{
                        clients[0].serverIp = d
                    }}/>
                    <InputText placeholder={`${t("服务器")}port`} value={clients[0]?.serverPort} handleInputChange={(d)=>{
                        clients[0].serverPort = parseInt(d)
                    }}/>
                    <InputText placeholder={t("名称")} value={clients[0]?.client_name} handleInputChange={(d)=>{
                        clients[0].client_name = d
                    }}/>
                    <InputText placeholder={"key "} value={clients[0]?.key} handleInputChange={(d)=>{
                        clients[0].key = d
                    }}/>
                    <form>
                        {t("状态")}
                        <Rows isFlex={true} columns={[
                            <InputRadio value={1} context={t("开启")} selected={clients[0]?.open}  onchange={()=>{
                                clients[0].open = !clients[0].open
                                set_clients([...clients])
                            }}/>,
                            <InputRadio value={1} context={t("关闭")} selected={!clients[0]?.open}  onchange={()=>{
                                clients[0].open = !clients[0].open
                                set_clients([...clients])
                            }}/>
                        ]}/>
                    </form>
                </Card>

                <Card self_title={<span
                    className={" div-row "}><h2>{t(`更多服务器`)}</h2> </span>}>

                    <ActionButton icon={"add"} onClick={() => {
                        clients.push({
                            open:false,
                            is_new: true
                        })
                        set_clients([...clients])
                    }} title={t("添加")}/>
                    {t("代理")}

                    <Table headers={all_client_headers} rows={clients.slice(1).map((item:tcp_proxy_client_fig, index) => {
                        const new_list = [
                            <p>{index}</p>,
                            <InputText value={item.serverPort} handleInputChange={(value) => {
                                item.serverPort = parseInt(value);
                            }} no_border={true}/>,
                            <InputText value={item.serverIp}  handleInputChange={(value) => {
                                item.serverIp = value
                            }} no_border={true}/>,
                            <InputText value={item.client_name} handleInputChange={(value) => {
                                item.client_name = value;
                            }} no_border={true}/>,
                            <InputText value={item.key} handleInputChange={(value) => {
                                item.key = value;
                            }} no_border={true}/>,
                            <StatusCircle ok={!!item.status}/>,
                            <Select value={!!item.open} onChange={(value) => {
                                item.open = value === "true"
                                set_clients([...clients])
                            }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <div>
                                <ActionButton icon={"delete"} title={t("删除")} onClick={async () => {
                                    if(item.is_new) {
                                        const new_list = []
                                        for (let i=0;i<(clients.length??0);i++) {
                                            if(i!== index) {
                                                new_list.push(clients[i])
                                            }
                                        }
                                        set_clients([...new_list])
                                    } else {
                                        await del_client(index+1)
                                        // await bridge_del(item.id,item.server_client_num_id)
                                    }
                                }}/>
                                {
                                    item.is_new  ?
                                        <ActionButton icon={"add"} title={t("添加")} onClick={async () => {
                                            // await bridge_add(item)
                                            item.index = index+1;
                                            await save(item)
                                        }}/> :
                                        <ActionButton icon={"save"} title={t("保存")} onClick={async () => {
                                            // await bridge_edit(item)
                                            item.index = index+1;
                                            await save(item)
                                        }}/>
                                }
                            </div>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </Card>


            </Column>
            <Column widthPer={40}>
                <Card title={t("桥接服务端口列表")} >
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
