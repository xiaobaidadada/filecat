import React, {useEffect, useRef, useState} from 'react'
import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {ws} from "../../util/ws";
import {CmdType} from "../../../../common/frame/WsData";
import { videoHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {InputTextIcon} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";
import {FullScreenDiv} from "../../../meta/component/Dashboard";
import {NavIndexContainer} from "../navindex/component/NavIndexContainer";
import Header from '../../../meta/component/Header';
import "video.js/dist/video-js.min.css";
import type Player from "video.js/dist/types/player";
import videojs from "video.js";
// import "videojs-mobile-ui/dist/videojs-mobile-ui.css";
import flvjs from 'flv.js';
import {WsClient} from "../../../../common/frame/ws.client";
import {NotyFail} from "../../util/noty";
import {SysSoftware} from "../../../../common/req/setting.req";

let flvPlayer;
export function Rtsp() {
    const { t } = useTranslation();

    const [address, setAddress] = useState(undefined);
    const [status, setStatus] = useState<boolean>(false);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);

    const videoRef = useRef(null);
    const playerRef = useRef(null);


    const connect = async (address)=>{
        if (!user_base_info.sysSoftWare || !user_base_info.sysSoftWare[SysSoftware.ffmpeg] || !user_base_info.sysSoftWare[SysSoftware.ffmpeg].installed) {
            NotyFail(t("找不到ffmpeg"))
            return ;
        }
        const videoJsOptions = {
            controls: true,
            // responsive: true,
            // fluid: true,
            width: 640, // 固定宽度
            height: 360, // 固定高度
            // sources: [{
            //     src: 'http://10.244.209.36:5567/download?file=%E4%B8%B4%E6%97%B6/input.mp4&token=1722917438651',
            //     type: 'video/mp4'
            // }]
        };
        // 初始化 Video.js 播放器
        playerRef.current = videojs(videoRef.current, videoJsOptions);

        if (flvjs.isSupported()) {
            flvPlayer = flvjs.createPlayer({
                type: 'flv',
                url: WsClient.getOtherWebSocketUrl(CmdType.rtsp_get,{url:address}),
                isLive: true, //标记为直播流
                // enableWorker: true, //启用worker加速
            });
            flvPlayer.attachMediaElement(videoRef.current);
            flvPlayer.load();
            flvPlayer.load();

        } else {
            NotyFail("FLV.js is not supported in this browser.");
        }
        return () => {

        };
    }
    useEffect(() => {
        return ()=>{
            if (flvPlayer) {
                flvPlayer.pause();
                flvPlayer.unload(); // 解除对流的绑定，释放资源
                flvPlayer.detachMediaElement(); // 从视频元素中解除绑定
                flvPlayer.destroy(); // 销毁播放器实例
                flvPlayer = null;
            }
            // 销毁 Video.js 播放器
            if (playerRef.current) {
                playerRef.current.dispose();
            }
        }
    }, []);
    const go = (item?: any) => {
        setStatus(true)
        connect(!!item.address ?item.address:address);
    }
    const close = async () => {

        await ws.sendData(CmdType.rdp_disconnect, "")
        setStatus(false);

    }
    const getItems = async () => {
        const result = await videoHttp.get("tag");
        if (result.code === RCode.Sucess) {
            return result.data;
        }
        return [];
    }
    const saveItems = async (items) => {
        const rsq = await videoHttp.post("tag/save", items);
        if (rsq.code !== RCode.Sucess) {
            NotyFail("网络错误")
        }
    }
    const clickItem = async (item: any) => {
        setAddress(item.address);
        go(item);
    }
    return <div>
        <Header>
            <InputTextIcon max_width={"40rem"} placeholder={t("  rtsp://username:password@ip:port/path")} icon={"link"} value={address}
                           handleInputChange={(v) => setAddress(v)}/>
            {!status && <ActionButton icon={"play_arrow"} title={t("连接")} onClick={go}/>}
            {status && <ActionButton icon={"close"} title={t("关闭")} onClick={close}/>}
        </Header>
            {!status && <NavIndexContainer getItems={getItems} save={saveItems} clickItem={clickItem} items={[{key: "name", preName: t("名字")}, {key: "address", preName: t("地址")}]}/>}
            <canvas id="rdpwebview" style={{"display": "none"}}/>
        <div style={{
            "display":status?"block":"none"
        }}>
             <video ref={videoRef}  className="video-js vjs-default-skin"/>
        </div>

    </div>
}
