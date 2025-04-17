import React, {useEffect, useRef, useState} from 'react'
import {ddnsHttp, netHttp, settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySucess,NotyFail} from "../../util/noty";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle} from "../../../meta/component/Card";
import {InputRadio, InputText, Select} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows, Table} from "../../../meta/component/Table";
import {TcpPorxyITem, VirClientPojo, VirServerEnum, VirServerPojo} from "../../../../common/req/net.pojo";
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


    // tcp代理
    const tcp_proxy_list_header = [t("端口"),t("目标地址"), t("目标端口"),t("开启"),t("备注"),t("状态"),t("删除") ];
    const [tcp_proxy_list, set_tcp_proxy_list] = useState([] as TcpPorxyITem[]);
    const [tcp_proxy_status, set_tcp_proxy_status] = useState({});

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
                set_tcp_proxy_status(st);
                ws.addMsg(CmdType.vir_net_client_get,(data)=>{
                    set_connet_state(data.context.state);
                    st = {};
                    for (const it of data.context.tcp_proxy_list_status ??[]) {
                        st[it.param] = it.status;
                    }
                    set_tcp_proxy_status(st);
                })
            }

            // 获取tcp代理
            const rtcp =  await netHttp.post("vir/client/tcp_proxy/get");
            if (rtcp.code === RCode.Sucess) {
                set_tcp_proxy_list(rtcp.data)
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

    // 外部软件
    const save_outside_software = async () => {
        const list = [];
        for (let i=0;i<tcp_proxy_list.length;i++){
            tcp_proxy_list[i].index = i;
            list.push(tcp_proxy_list[i]);
        }
        const result = await netHttp.post("vir/client/tcp_proxy/save", list);
        if (result.code === RCode.Sucess) {
            NotySucess("保存成功")
        }
    }
    const tcp_del=  (index)=> {
        tcp_proxy_list.splice(index, 1);
        set_tcp_proxy_list([...tcp_proxy_list]);
    }
    const tcp_add=  ()=> {
        set_tcp_proxy_list([...tcp_proxy_list,{note:"",open:false,port:0,target_port:0,target_ip:""} as TcpPorxyITem]);
    }
    const tcp_onChange = (item,value,index)=> {
        const list = [];
        for (let i=0; i<tcp_proxy_list.length; i++) {
            if (i !== index) {
                tcp_proxy_list[i].open = false;
            } else {
                tcp_proxy_list[i].open = value === "true";
            }
            list.push(tcp_proxy_list[i])
        }
        // setRows([]);
        set_tcp_proxy_list(list);
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

            <Column>
                <CardFull self_title={<span className={" div-row "}><h2>{t("Tcp Proxy")}</h2> </span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={tcp_add}/><ActionButton icon={"save"} title={t("保存")} onClick={save_outside_software}/></div>}>
                    <Table headers={tcp_proxy_list_header} rows={tcp_proxy_list.map((item, index) => {
                        const new_list = [
                            <InputText value={item.port} handleInputChange={(value) => {
                                item.port = parseInt(value);
                            }} no_border={true}/>,
                            <InputText value={item.target_ip} handleInputChange={(value) => {
                                item.target_ip = value;
                            }} no_border={true}/>,
                            <InputText value={item.target_port} handleInputChange={(value) => {
                                item.target_port = parseInt(value);
                            }} no_border={true}/>,
                            <Select value={item.open} onChange={(value) => {
                                tcp_onChange(item,value,index);
                            }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <StatusCircle ok={tcp_proxy_status[item.index]} />,
                            <div>
                                 <ActionButton icon={"delete"} title={t("删除")} onClick={() => tcp_del(index)}/>
                            </div>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Column>
        </Row>
    </div>
}
