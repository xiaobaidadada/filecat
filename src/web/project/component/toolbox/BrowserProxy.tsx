import React, {useEffect, useState} from 'react'
import {InputTextIcon} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";
import Noty from "noty";
import Header from "../../../meta/component/Header";
import {FullScreenDiv} from "../../../meta/component/Dashboard";
import {netHttp} from "../../util/config";
import {NetPojo} from "../../../../common/req/net.pojo";
import {RCode} from "../../../../common/Result.pojo";
import {NavIndexContainer} from "../navindex/component/NavIndexContainer";
import {useTranslation} from "react-i18next";
import {$stroe} from "../../util/store";
import {useRecoilState} from "recoil";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {NotyFail} from "../../util/noty";


export function BrowserProxy(props) {
    const { t } = useTranslation();
    const [headerMin, setHeaderMin] = useRecoilState($stroe.header_min);

    const [showUrl, setshowUrl] = useState('');
    const [gourl,setGourl] = useState('');
    const [sysPort,setSysPort] = useState(undefined);
    const [fullScreen, setFullScreen] = useState(false);
    const {check_user_auth} = use_auth_check();

    const close = async () => {
        const req = new NetPojo();
        req.targetProxyUrl = typeof showUrl === "string" ?showUrl: gourl;
        const result = await netHttp.post("close",req)
        if (result.code !== RCode.Sucess) {
            return;
        }
        setGourl("")
        setHeaderMin(false);
    }
    const go = async (url?:string)=>{
        // if (!gourl.startsWith('http://') && !gourl.startsWith('https://')) {
        //     setUrl('http://' + gourl)
        // } else {
        //     setUrl(gourl)
        // }
        const req = new NetPojo();
        req.targetProxyUrl = typeof url === "string" ?url: showUrl;
        if(!req.targetProxyUrl.startsWith("http")) {
            NotyFail("must start with http[s]://");
            return;
        }
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
    const fullscreen = ()=>{
        setFullScreen(!fullScreen)
        setHeaderMin(!fullScreen);
    }
    return <div>
        <Header>
            <InputTextIcon placeholder={t("系统代理端口")} icon={"outlet"} value={sysPort} handleInputChange={handlerSysPort} max_width={"10rem"}/>
            <InputTextIcon placeholder={t("要代理的url")} icon={"link"} value={showUrl} handleInputChange={(v) => {
                setshowUrl(v);
            }}/>
            <ActionButton icon={"play_arrow"} title={t("开始代理")} onClick={go}/>
            <ActionButton icon={"fullscreen"} title={t("全屏")} onClick={fullscreen}/>
            <ActionButton icon={"close"} title={t(t("关闭"))} onClick={() => {close(); setFullScreen(false);setshowUrl("")}}/>
        </Header>

        <FullScreenDiv isFull={fullScreen}>
            <div id="browser">
                {!gourl && <NavIndexContainer have_auth_edit={check_user_auth(UserAuth.browser_proxy_tag_update)} getItems={getItems}  save={saveItems} clickItem={clickItem} items={[{key:"name",preName:t("名字")},{key:"url",preName:"url"},{key:"color",preName:"color"}]}/>}
                <iframe id="webview" src={gourl}></iframe>
            </div>
        </FullScreenDiv>
    </div>
}
