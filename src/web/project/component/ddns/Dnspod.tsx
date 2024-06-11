import React, {useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Menu, Row, RowColumn} from '../../../meta/component/Dashboard';
import {Card} from "../../../meta/component/Card";
import {ButtonText} from "../../../meta/component/Button";
import {Rows} from "../../../meta/component/Table";
import {InputRadio, InputText} from "../../../meta/component/Input";
import {ddnsHttp,} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {DdnsConnection, DdnsIPPojo, DdnsType, DnsPod} from "../../../../common/req/ddns.pojo";
import Noty from "noty";

export function Dnspod(props: any) {
    const [ipv4s,setIpv4s] = useState([]);
    const [ipv6s,setIpv6s] = useState([]);
    const [id,setId] = useState("");
    const [token,setToken] = useState("");
    const [isOpen,setIsOpen] = useState(false);
    useEffect( () => {
        (async ()=>{
            const rsp = await ddnsHttp.get("ips/dnspod");
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
                setId((data.account as DnsPod).id);
                setToken((data.account as DnsPod).token);
            }
            setIsOpen(data.isOpen)
        })();

    },[]);
    const save = async ()=>{
        if (isOpen && (!id || !token)) {
            new Noty({
                type: 'error',
                text: 'id和token都不能为空',
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
        data.account={id,token};
        data.isOpen=isOpen;
        data.ddnsType=DdnsType.dnspod;
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
    return <div>
        <Row>
            <Column >
                <Card title={"ipv4"} >
                    {ipv4s.length>0 &&
                        ipv4s.map((item,index) => {return <div key={index}>
                            {`${item.ifaceOrWww}(${item.ip})`}
                            <InputText placeholder={"a.abc.com b.abc.com ..."} value={item.ddnsHost} handleInputChange={(d)=>{item.ddnsHost=d}}/>
                        </div>})
                    }
                </Card>
                <Card title={"ipv6"} >
                    {ipv6s.length>0 &&
                        ipv6s.map((item,index) => {return <div key={index}>
                            {`${item.ifaceOrWww}(${item.ip})`}
                            <InputText placeholder={"a.abc.com b.abc.com ..."} value={item.ddnsHost} handleInputChange={(d)=>{item.ddnsHost=d}}/>
                        </div>})
                    }
                </Card>

            </Column>
            <Column>
                <Card title={"账号设置"} rightBottomCom={<ButtonText text={'保存'} clickFun={save}/>}>
                    <InputText placeholder={"ID"} value={id} handleInputChange={(d)=>{setId(d)}}/>
                    <InputText placeholder={"TOKEN"} value={token} handleInputChange={(d)=>{setToken(d)}}/>
                    <Rows isFlex={true} columns={[
                        <InputRadio value={1} context={"开启"} selected={isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>,
                        <InputRadio value={1} context={"关闭"} selected={!isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>
                    ]}/>
                </Card>
                <Card title={"说明"} >
                    域名如果不存在会自动创建，空子域名是@，ip6和ipv4可以互相切换。
                </Card>
            </Column>
        </Row>
    </div>

}
