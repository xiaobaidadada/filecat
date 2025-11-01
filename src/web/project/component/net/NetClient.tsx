import React, {useEffect, useRef, useState} from 'react'
import {ddnsHttp, netHttp, settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySucess,NotyFail} from "../../util/noty";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle} from "../../../meta/component/Card";
import {InputRadio, InputText, Select} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows, Table} from "../../../meta/component/Table";
import {TcpProxyITem, VirClientPojo, VirServerEnum, VirServerPojo} from "../../../../common/req/net.pojo";
import {useTranslation} from "react-i18next";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";

export function NetClient(props) {
    const { t } = useTranslation();

    const [ip, setIp] = useState("");
    const [mask, setMask] = useState(undefined);
    const [serverIp, setServerIp] = useState("");
    const [client_name, set_client_name] = useState("");
    const [serverPort, setServerPort] = useState(undefined);
    const [isOpen,setIsOpen] = useState(false);
    // const [isUdp, setIsUdp] = useState(false);
    const [key,setKey] = useState("");
    const [connet_state,set_connet_state] = useState<boolean>(false);




    useEffect(() => {
        const init = async ()=>{
            const result = await netHttp.get("vir/client/get");
            if (result.code !== RCode.Sucess) {
                return;
            }
            const data = result.data as VirClientPojo;
            setServerPort(data.serverPort);
            setServerIp(data.serverIp);
            setIp(data.ip);
            setMask(data.mask);
            setKey(data.key);
            setIsOpen(data.open);
            set_client_name(data.client_name);
            // setIsUdp(data.model===VirServerEnum.udp);
            if(data.open) {
                const data = new WsData(CmdType.vir_net_client_get);
                const r = await ws.send(data);
                const state = r.context.state;
                set_connet_state(state);
                let st = {};
                for (const it of r.context.tcp_proxy_list_status ??[]) {
                    st[it.param] = it.status;
                }

                ws.addMsg(CmdType.vir_net_client_get,(data)=>{
                    set_connet_state(data.context.state);
                    st = {};
                    for (const it of data.context.tcp_proxy_list_status ??[]) {
                        st[it.param] = it.status;
                    }

                })
            }


        }
        init();
    }, []);
    const save =async ()=>{
        const pojo = new VirClientPojo();
        pojo.ip = ip;
        pojo.mask = parseInt(mask);
        pojo.key = key;
        pojo.serverIp = serverIp;
        pojo.serverPort = parseInt(serverPort);
        pojo.open = isOpen;
        pojo.client_name = client_name;
        // pojo.model = isUdp?VirServerEnum.udp:VirServerEnum.tcp;
        const result = await netHttp.post("vir/client/save", pojo);
        if (result.code !== RCode.Sucess) {
            NotyFail("网络错误")
            return;
        }
        NotySucess("保存成功")
    }


    return <div>
        <Row>

            <Column>
                <Card title={""} rightBottomCom={<ButtonText text={t('保存')} clickFun={save}/>} titleCom={<div>{t("连接状态")}<StatusCircle ok={connet_state} /></div>}>
                    <InputText placeholder={"ip "} value={ip} handleInputChange={(d)=>{setIp(d)}}/>
                    <InputText placeholder={"mask"} value={mask} handleInputChange={(d)=>{setMask(d)}}/>
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
                    {/*<form>*/}
                    {/*    {t("模式")}*/}
                    {/*    <Rows isFlex={true} columns={[*/}
                    {/*        <InputRadio value={1} context={`tcp${t("流量转发")}`} selected={!isUdp}  onchange={()=>{setIsUdp(!isUdp)}}/>,*/}
                    {/*        <InputRadio value={1} context={`udp${t("点对点")}`} selected={isUdp}  onchange={()=>{setIsUdp(!isUdp)}}/>*/}
                    {/*    ]}/>*/}
                    {/*</form>*/}

                </Card>
                <Card title={""} >
                    <div>
                       ip:  虚拟ip, “10.0.0.0 - 10.255.255.255”和“172.16.0.0 - 172.31.255.255”和“192.168.0.0 - 192.168.255.255”这三个网段属于内网ip
                    </div>
                    <div>
                       mask: 一些常见的子网掩码网段/8：255.0.0.0；/16：255.255.0.0 ；/24：255.255.255.0
                    </div>
                    <div>
                        key：用于验证身份信息并加密的和服务器设置的一样
                    </div>
                </Card>
            </Column>

        </Row>
    </div>
}
