import React, {useEffect, useRef, useState} from 'react'
import {InputText, InputTextIcon, Select} from "../../../meta/component/Input";
import {ActionButton, Button, ButtonLittle, ButtonText} from "../../../meta/component/Button";
import Noty from "noty";
import Header from "../../../meta/component/Header";
import {netHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NavIndexContainer} from "../navindex/component/NavIndexContainer";


export function NetWol(props) {

    const [mac, setMac] = useState('');
    const go = async (macAddress?: string) => {
        const mac_v = macAddress?macAddress:mac;
        if (!mac_v) {
            new Noty({
                type: 'error',
                text: 'mac地址不能为空',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout: "bottomLeft"
            }).show();
            return;
        }
        const rsp = await netHttp.post("wol/exec", {mac:mac_v});
        if (rsp.code !== RCode.Sucess) {
            return;
        }
        new Noty({
            type: 'success',
            text: '发送唤醒命令成功',
            timeout: 1000, // 设置通知消失的时间（单位：毫秒）
            layout: "bottomLeft"
        }).show();
    }

    const getItems = async () => {
        const result = await netHttp.get("wol/tag");
        if (result.code === RCode.Sucess) {
            return result.data;
        }
        return [];
    }
    const saveItems = async (items) => {
        const rsq = await netHttp.post("wol/tag/save", items);
        if (rsq.code !== RCode.Sucess) {
            new Noty({
                type: 'error',
                text: '网络错误',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout: "bottomLeft"
            }).show();
        }
    }
    const clickItem = async (item: any) => {
        setMac(item.mac);
        go(item.mac);
    }

    return <div>
        <Header>
            <ActionButton icon={"play_arrow"} title={"发送"} onClick={()=>{go();}}/>
            <InputTextIcon placeholder={"目标设备mac地址"} icon={"laptop_mac"} value={mac} handleInputChange={(v) => setMac(v)}/>
        </Header>

        <NavIndexContainer getItems={getItems} save={saveItems} clickItem={clickItem} items={[{key: "name", preName: "名字"}, {key: "mac", preName: "mac地址"}]}/>
    </div>
}
