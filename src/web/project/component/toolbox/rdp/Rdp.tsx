import React, {useEffect, useRef, useState} from 'react'
import {InputText, InputTextIcon, Select} from "../../../../meta/component/Input";
import {Card} from "../../../../meta/component/Card";
import {ActionButton, Button, ButtonText} from "../../../../meta/component/Button";
import {isNumeric} from "../../../util/WebPath";
import Noty from "noty";
import Header from "../../../../meta/component/Header";


import {Mstsc} from './client/js/mstsc.js';
import {FullScreenDiv} from "../../../../meta/component/Dashboard";
import {CmdType, WsData} from "../../../../../common/frame/WsData";
import {ws} from '../../../util/ws';
import {NavIndexContainer} from "../../navindex/component/NavIndexContainer";
import {netHttp, rdpHttp} from "../../../util/config";
import {RCode} from "../../../../../common/Result.pojo";
import {useTranslation} from "react-i18next";
import {NotyFail} from "../../../util/noty";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";


// require('./client/js/rle');
export function Rdp() {
    const { t } = useTranslation();
    const [headerMin, setHeaderMin] = useRecoilState($stroe.header_min);

    const [address, setAddress] = useState(undefined);
    const [username, setUsername] = useState(undefined);
    const [password, setPassword] = useState(undefined);
    const [fullScreen, setFullScreen] = useState(false);
    const [status, setStatus] = useState<boolean>(false);
    var client = null;
    useEffect(() => {

        return ()=>{
            if (client) {
                client.remove();
                client = null;
            }
        }
    }, []);
    const go = (item?: any) => {
        setStatus(true)


        function load(canvas) {
            if(!client)
            client = Mstsc.client.create(Mstsc.$(canvas));
        }


        function connect(ip, username, password) {
            ip = ip?ip :item.address,username=username?username : item.username,password =password ? password : item.password;
            if (!ip || !username || !password) {
                NotyFail(t("不允许为空"));
                setStatus(false)
                return;
            }
            load("rdpwebview");
            // Mstsc.$("main").style.display = 'none';
            var canvas = Mstsc.$("rdpwebview");
            canvas.style.display = 'inline';
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            // canvas.width = "100%";
            // canvas.height = "100%";

            setFullScreen(true);
            setHeaderMin(true);
            client.connect(ip, "", username, password, function (err) {
                Mstsc.$("rdpwebview").style.display = 'none';
                setHeaderMin(false);
                setStatus(false);
                setFullScreen(false);
                // Mstsc.$("main").style.display = 'inline';
            });
        }

        connect(address, username, password);
    }
    const close = async () => {
        setFullScreen(false);

        await ws.sendData(CmdType.rdp_disconnect, "")
        var canvas = Mstsc.$("rdpwebview");
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        Mstsc.$("rdpwebview").style.display = 'none';
        setStatus(false);
        setHeaderMin(false);
    }
    const getItems = async () => {
        const result = await rdpHttp.get("tag");
        if (result.code === RCode.Sucess) {
            return result.data;
        }
        return [];
    }
    const saveItems = async (items) => {
        const rsq = await rdpHttp.post("tag/save", items);
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
        setPassword(item.password);
        setUsername(item.username);
        setAddress(item.address);
        go(item);
    }
    return <div>
        <Header>
            <InputTextIcon placeholder={t("地址")} icon={"outlet"} value={address}
                           handleInputChange={(v) => setAddress(v)}/>
            <InputTextIcon placeholder={t("账号")} icon={"http"} value={username}
                           handleInputChange={(v) => setUsername(v)}/>
            <InputTextIcon placeholder={t("密码")} icon={"http"} value={password}
                           handleInputChange={(v) => setPassword(v)}/>
            {!status && <ActionButton icon={"play_arrow"} title={t("连接")} onClick={go}/>}
            {/*<ActionButton icon={"fullscreen"} title={t("全屏")} onClick={() => setFullScreen(!fullScreen)}/>*/}
            {status && <ActionButton icon={"close"} title={t("关闭")} onClick={close}/>}
        </Header>
        <FullScreenDiv isFull={fullScreen}>
            {!status && <NavIndexContainer getItems={getItems} save={saveItems} clickItem={clickItem} items={[{key: "name", preName: t("名字")}, {key: "address", preName: t("地址")}, {key: "username", preName: t("账号")}, {key: "password", preName: t("密码")}]}/>}
            <canvas id="rdpwebview" style={{"display": "none"}}/>
        </FullScreenDiv>

    </div>
}
