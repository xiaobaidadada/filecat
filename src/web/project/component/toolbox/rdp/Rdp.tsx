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


// require('./client/js/rle');
export function Rdp() {
    const [address, setAddress] = useState();
    const [username, setUsername] = useState();
    const [password, setPassword] = useState();
    const [fullScreen, setFullScreen] = useState(false);
    const [status, setStatus] = useState<boolean>(false);

    const go = (item?: any) => {
        setStatus(true)
        var client = null;

        function load(canvas) {
            client = Mstsc.client.create(Mstsc.$(canvas));
        }


        function connect(ip, username, password) {
            load("webview");
            // Mstsc.$("main").style.display = 'none';
            var canvas = Mstsc.$("webview");
            canvas.style.display = 'inline';
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            // canvas.width = "100%";
            // canvas.height = "100%";
            client.connect(ip?ip :item.address , "", username?username : item.username , password ? password : item.password, function (err) {
                Mstsc.$("webview").style.display = 'none';
                // Mstsc.$("main").style.display = 'inline';
            });
        }


        connect(address, username, password);
    }
    const close = async () => {
        setFullScreen(false);

        await ws.sendData(CmdType.rdp_disconnect, "")
        var canvas = Mstsc.$("webview");
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        Mstsc.$("webview").style.display = 'none';
        setStatus(false);
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
            <title><h3>FileCat</h3></title>
            <InputTextIcon placeholder={"地址"} icon={"outlet"} value={address}
                           handleInputChange={(v) => setAddress(v)}/>
            <InputTextIcon placeholder={"账号"} icon={"http"} value={username}
                           handleInputChange={(v) => setUsername(v)}/>
            <InputTextIcon placeholder={"密码"} icon={"http"} value={password}
                           handleInputChange={(v) => setPassword(v)}/>
            <ActionButton icon={"play_arrow"} title={"连接"} onClick={go}/>
            <ActionButton icon={"fullscreen"} title={"全屏"} onClick={() => setFullScreen(!fullScreen)}/>
            <ActionButton icon={"close"} title={"关闭"} onClick={close}/>
        </Header>
        <FullScreenDiv isFull={fullScreen}>
            {!status && <NavIndexContainer getItems={getItems} save={saveItems} clickItem={clickItem} items={[{key: "name", preName: "名字"}, {key: "address", preName: "地址"}, {key: "username", preName: "账号"}, {key: "password", preName: "密码"}]}/>}
            <canvas id="webview" style={{"display": "none"}}/>
        </FullScreenDiv>

    </div>
}
