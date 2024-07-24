import React, {useEffect, useRef, useState} from 'react'
import {InputText, InputTextIcon, Select} from "../../../meta/component/Input";
import {Card} from "../../../meta/component/Card";
import {ActionButton, Button, ButtonLittle, ButtonText} from "../../../meta/component/Button";
import {isNumeric} from "../../util/WebPath";
import Noty from "noty";
import Header from "../../../meta/component/Header";
import {FullScreenDiv} from "../../../meta/component/Dashboard";
import { netHttp} from "../../util/config";
import {NetPojo} from "../../../../common/req/net.pojo";
import {RCode} from "../../../../common/Result.pojo";
import {Blank} from "../../../meta/component/Blank";
import {NavIndexContainer} from "../navindex/component/NavIndexContainer";



export function BrowserProxy(props) {
    const [showUrl, setshowUrl] = useState('');
    const [gourl,setGourl] = useState('');
    const [sysPort,setSysPort] = useState(undefined);
    const [fullScreen, setFullScreen] = useState(false);
    const close = async () => {
        const req = new NetPojo();
        req.targetProxyUrl = typeof showUrl === "string" ?showUrl: gourl;
        const result = await netHttp.post("close",req)
        if (result.code !== RCode.Sucess) {
            return;
        }
        setGourl("")
    }
    const go = async (url?:string)=>{
        // if (!gourl.startsWith('http://') && !gourl.startsWith('https://')) {
        //     setUrl('http://' + gourl)
        // } else {
        //     setUrl(gourl)
        // }
        const req = new NetPojo();
        req.targetProxyUrl = typeof url === "string" ?url: showUrl;
        req.sysProxyPort = sysPort;
        const rsp = await netHttp.post("start", req);
        if (rsp.code !== RCode.Sucess) {
            return;
        }
        const host = `${window.location.protocol}//${window.location.hostname}:${rsp.data}`;
        setGourl(host)
        // document.getElementById('webview').src = host;
    }
    useEffect(() => {
        return () => {
            close();
        }
    }, [])
    const getItems = async ()=>{
        const result = await netHttp.get("tag");
        if (result.code === RCode.Sucess) {
            return result.data;
        }
        return [];
    }
    const saveItems = async (items)=>{
        const rsq = await netHttp.post("tag/save",items);
        if (rsq.code !== RCode.Sucess) {
            new Noty({
                type: 'error',
                text: '网络错误',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }
    const clickItem = async (item: { url?: string, name?: string })=>{
        setshowUrl(item.url);
        go(item.url);
    }
    const handlerSysPort = (v)=>{
        if (!v) {
            return;
        }
        const isNumber = /^\d+$/.test(v);
        if (!isNumber) {
            new Noty({
                type: 'error',
                text: '不是数字',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
        setSysPort(parseInt(v));
    }
    return <div>
        <Header>
            <InputTextIcon placeholder={"系统代理端口"} icon={"outlet"} value={sysPort} handleInputChange={handlerSysPort} max_width={"10rem"}/>
            <InputTextIcon placeholder={"要代理的url"} icon={"http"} value={showUrl} handleInputChange={(v) => {
                setshowUrl(v);
            }}/>
            <ActionButton icon={"play_arrow"} title={"开始代理"} onClick={go}/>
            <ActionButton icon={"fullscreen"} title={"全屏"} onClick={() => setFullScreen(!fullScreen)}/>
            <ActionButton icon={"close"} title={"关闭"} onClick={() => {close(); setFullScreen(false);setshowUrl("")}}/>
        </Header>

        <FullScreenDiv isFull={fullScreen}>
            <div id="browser">
                {!gourl && <NavIndexContainer getItems={getItems}  save={saveItems} clickItem={clickItem} items={[{key:"name",preName:"名字"},{key:"url",preName:"url"}]}/>}
                <iframe id="webview" src={gourl}></iframe>
            </div>
        </FullScreenDiv>
    </div>
}
