import React, {ReactNode, useEffect, useRef, useState} from 'react';
import "video.js/dist/video-js.min.css";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import "videojs-hotkeys";

const getOptions = (...srcOpt: any[]) => {
    const options = {
        controlBar: {
            skipButtons: {
                forward: 5,
                backward: 5,
            },
        },
        html5: {
            nativeTextTracks: false,
        },
        plugins: {
            hotkeys: {
                volumeStep: 0.1,
                seekStep: 10,
                enableModifiersForNumbers: false,
            },
        },
    };

    return videojs.obj.merge(options, ...srcOpt);
};

const getSourceType = (source: string) => {
    const fileExtension = source ? source.split("?")[0].split(".").pop() : "";
    if (fileExtension?.toLowerCase() === "mkv") {
        return "video/mp4";
    }
    return  "video/mp4";
};
let player:Player;
export function VideoPlayer(props: {source:string,options:any}) {
    const videoPlayer = useRef(null);


    const initVideoPlayer = async () => {
        try {
            const sourceType = getSourceType(props.source);
            const srcOpt = { sources: { src: props.source, type:sourceType } };
            const playbackRatesOpt = { playbackRates: [0.5, 1, 1.5, 2, 2.5, 3] };
            let options = getOptions(props.options, srcOpt, playbackRatesOpt);
            player = videojs(videoPlayer.current, options, () => {});
        } catch (error) {
            console.error("Error initializing video player:", error);
        }
    };
    useEffect(() => {
        initVideoPlayer();
        return ()=>{
            if(player){
                player.dispose();
                player = null;
            }
        }
    }, []);
    return <video ref={videoPlayer}  className="video-js" style={{width: '100%', height: '100%'}} controls
                  preload="auto">
        <source/>
        <p className="vjs-no-js">
            浏览器不支持video.js
        </p>
    </video>
};
