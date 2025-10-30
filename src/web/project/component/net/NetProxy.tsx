import React, {useEffect, useState} from 'react'
import {netHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySucess} from "../../util/noty";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle} from "../../../meta/component/Card";
import {InputRadio, InputText, Select} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows, Table} from "../../../meta/component/Table";
import {HttpProxy, TcpPorxyITem} from "../../../../common/req/net.pojo";
import {useTranslation} from "react-i18next";

export function NetProxy(props) {
    const { t } = useTranslation();

    const [ip, setIp] = useState("");
    const [port, setPort] = useState("");
    const [ignore_ips, setIgnoredIps] = useState("");
    const [enabled, setEnabled] = useState(false);
    const [useForLocal, setUseForLocal] = useState<boolean>(false);



    // tcp代理
    const tcp_proxy_list_header = [t("端口"),t("目标地址"), t("目标端口"),t("开启"),t("备注"),t("状态"),t("删除") ];
    const [tcp_proxy_list, set_tcp_proxy_list] = useState([] as TcpPorxyITem[]);
    const [tcp_proxy_status, set_tcp_proxy_status] = useState({});

    const init = async ()=>{

        // 获取tcp代理
        const [rtcp,proxy] =  await Promise.all([
            netHttp.post("vir/client/tcp_proxy/get"),
            netHttp.post("http/proxy/get")
        ]);
        if (rtcp.code === RCode.Sucess) {
            set_tcp_proxy_list(rtcp.data)
        }
        if(proxy.code === RCode.Sucess) {
            const pojo = proxy.data as HttpProxy
            setIp(pojo.ip)
            setPort(pojo.port)
            setEnabled(pojo.enabled)
            setIgnoredIps(pojo.bypass)
            setUseForLocal(pojo.useForLocal)
        }
    }

    useEffect(() => {
        init();
    }, []);

    const save_http_proxy = async ()=>{
        const pojo = new HttpProxy()
        pojo.port = port
        pojo.enabled = enabled
        pojo.useForLocal = useForLocal
        pojo.ip = ip
        pojo.bypass = ignore_ips
        const result = await netHttp.post("http/proxy/set", pojo);
        if (result.code === RCode.Sucess) {
            init();
            NotySucess("保存成功")
        }
    }

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
                <Card title={"Http Proxy"} rightBottomCom={<ButtonText text={t('保存')} clickFun={save_http_proxy}/>}>
                    <InputText placeholder={"ip (default localhost) "} value={ip} handleInputChange={(d)=>{setIp(d)}}/>
                    <InputText placeholder={"port "} value={port} handleInputChange={(d)=>{setPort(d)}}/>
                    <InputText placeholder={"忽略ip "} value={ignore_ips} handleInputChange={(d)=>{setIgnoredIps(d)}}/>

                    <form>
                        {t("请勿将代理服务器用于本地(Intranet)地址")}
                        <Rows isFlex={true} columns={[
                            <InputRadio value={1} context={t("开启")} selected={useForLocal}  onchange={()=>{setUseForLocal(!useForLocal)}}/>,
                            <InputRadio value={1} context={t("关闭")} selected={!useForLocal}  onchange={()=>{setUseForLocal(!useForLocal)}}/>
                        ]}/>
                    </form>
                    <form>
                        {t("状态")}
                        <Rows isFlex={true} columns={[
                            <InputRadio value={1} context={t("开启")} selected={enabled}  onchange={()=>{setEnabled(!enabled)}}/>,
                            <InputRadio value={1} context={t("关闭")} selected={!enabled}  onchange={()=>{setEnabled(!enabled)}}/>
                        ]}/>
                    </form>

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
