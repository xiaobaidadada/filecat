import React, {useEffect, useRef, useState} from 'react'
import {ddnsHttp, netHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySucess,NotyFail} from "../../util/noty";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {InputRadio, InputText} from "../../../meta/component/Input";
import {ButtonText} from "../../../meta/component/Button";
import {Rows} from "../../../meta/component/Table";
import {VirClientPojo, VirServerEnum, VirServerPojo} from "../../../../common/req/net.pojo";

export function NetClient(props) {

    const [ip, setIp] = useState("");
    const [mask, setMask] = useState(0);
    const [serverIp, setServerIp] = useState("");
    const [serverPort, setServerPort] = useState("");
    const [isOpen,setIsOpen] = useState(false);
    const [key,setKey] = useState("");

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
                <Card title={""} rightBottomCom={<ButtonText text={'保存'} clickFun={save}/>}>
                    <InputText placeholder={"ip "} value={ip} handleInputChange={(d)=>{setIp(d)}}/>
                    <InputText placeholder={"mask"} value={mask} handleInputChange={(d)=>{setMask(d)}}/>
                    <InputText placeholder={"服务器ip"} value={serverIp} handleInputChange={(d)=>{setServerIp(d)}}/>
                    <InputText placeholder={"服务器port"} value={serverPort} handleInputChange={(d)=>{setServerPort(d)}}/>
                    <InputText placeholder={"key "} value={key} handleInputChange={(d)=>{setKey(d)}}/>

                    <Rows isFlex={true} columns={[
                        <InputRadio value={1} context={"开启"} selected={isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>,
                        <InputRadio value={1} context={"关闭"} selected={!isOpen}  onchange={()=>{setIsOpen(!isOpen)}}/>
                    ]}/>
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
