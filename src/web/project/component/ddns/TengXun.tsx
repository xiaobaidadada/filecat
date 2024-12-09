import React, {useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn} from '../../../meta/component/Dashboard';
import {Card} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows} from "../../../meta/component/Table";
import {InputRadio, InputText} from "../../../meta/component/Input";
import {ddnsHttp,} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {DdnsConnection, DdnsIPPojo, DdnsType, DnsPod, ip_source_type, Tengxun} from "../../../../common/req/ddns.pojo";
import Noty from "noty";
import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {PromptEnum} from "../prompts/Prompt";
import {NotySucess} from "../../util/noty";
import Header from "../../../meta/component/Header";

export function TengXun(props: any) {
    const { t } = useTranslation();

    const [ipv4s,setIpv4s] = useState([]);
    const [ipv6s,setIpv6s] = useState([]);
    const [secretid,setSecretid] = useState("");
    const [secretkey,setSecretkey] = useState("");
    const [isOpen,setIsOpen] = useState(false);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [confirm, set_confirm] = useRecoilState($stroe.confirm);

    useEffect( () => {
        (async ()=>{
            const rsp = await ddnsHttp.get("ips/tx");
            if (rsp.code !== RCode.Sucess) {
                return;
            }
            const data = rsp.data as DdnsConnection;
            const ipv4list:DdnsIPPojo[] = [];
            const ipv6list:DdnsIPPojo[] = [];
            for (const item of data.ips) {
                if (item.isIPv4) {
                    ipv4list.push(item);
                } else {
                    ipv6list.push(item);
                }
            }
            setIpv4s(ipv4list);
            setIpv6s(ipv6list);
            if (data.account) {
                setSecretid((data.account as Tengxun).secretid);
                setSecretkey((data.account as Tengxun).secretkey);
            }
            setIsOpen(data.isOpen)
        })();

    },[]);
    const save = async ()=>{
        if (isOpen && (!secretid || !secretkey)) {
            new Noty({
                type: 'error',
                text: 'SecretId和SecretKey都不能为空',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
            return;
        }
        const data = new DdnsConnection();
        const ips:DdnsIPPojo[] = [];
        for (const item of [...ipv4s, ...ipv6s]) {
            if (item.ddnsHost) {
                ips.push(item);
            }
        }
        data.ips=ips;
        data.account={ secretid, secretkey};
        data.isOpen=isOpen;
        data.ddnsType=DdnsType.tengxun;
        const rsq = await ddnsHttp.post("save",data);
        if (rsq.code === RCode.DdnsAuthFail) {
            new Noty({
                type: 'error',
                text: rsq.data,
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        } else {
            new Noty({
                type: 'success',
                text: rsq.data,
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }

    const add_ipv = () => {
        setShowPrompt({show: true, type: PromptEnum.DdnsAddHttp, overlay: true, data: {}});
    }
    const delete_ipv = async (data) => {
        set_confirm({
            open: true, handle: async () => {
                const rsq = await ddnsHttp.post('http/del', data)
                if (rsq.code === 0) {
                    NotySucess("删除成功，稍后请刷新");
                }
                set_confirm({open: false, handle: null});
            }, title: "确定删除吗？"
        });

    }
    return <div>
        <Header>
            <ActionButton icon={"add"} title={t("添加http获取ip")} onClick={add_ipv}/>
        </Header>
        <Row>
            <Column >
                <Card title={"ipv4"} >
                    {ipv4s.length>0 &&
                        ipv4s.map((item,index) => {return <div key={index}>
                            {`${item.ifaceOrWww}(${item.ip})`}
                            <InputText
                                right_placeholder={<div>{item.source_type}{item.source_type ===ip_source_type.http_get && <ActionButton icon={"delete"} title={t("删除")} onClick={()=>{delete_ipv(item)}}/>}</div>}
                                placeholder={"a.abc.com b.abc.com ..."} value={item.ddnsHost} handleInputChange={(d)=>{item.ddnsHost=d}}/>
                        </div>})
                    }
                </Card>
                <Card title={"ipv6"} >
                    {ipv6s.length>0 &&
                        ipv6s.map((item,index) => {return <div key={index}>
                            {`${item.ifaceOrWww}(${item.ip})`}
                            <InputText
                                right_placeholder={<div>{item.source_type}{item.source_type ===ip_source_type.http_get && <ActionButton icon={"delete"} title={t("删除")} onClick={()=>{delete_ipv(item)}}/>}</div>}
                                placeholder={"a.abc.com b.abc.com ..."} value={item.ddnsHost} handleInputChange={(d)=>{item.ddnsHost=d}}/>
                        </div>})
                    }
                </Card>

            </Column>
            <Column>
                <Card title={t("账号设置")} rightBottomCom={<ButtonText text={t('保存')} clickFun={save}/>}>
                    <InputText placeholder={"SecretId"} value={secretid} handleInputChange={(d)=>{setSecretid(d)}}/>
                    <InputText placeholder={"SecretKey"} value={secretkey} handleInputChange={(d)=>{setSecretkey(d)}}/>
                    <Rows isFlex={true} columns={[
                        <InputRadio value={1} context={t("开启")} selected={isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>,
                        <InputRadio value={1} context={t("关闭")} selected={!isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>
                    ]}/>
                </Card>
                <Card title={t("说明")} >
                    域名如果不存在会自动创建，空子域名是@，ip6和ipv4可以互相切换。
                </Card>
            </Column>
        </Row>
    </div>

}
