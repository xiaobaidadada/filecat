import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {FileMenuData, FileMenuEnum} from "./FileMenuType";
import {VideoTrans} from "./VideoTrans";
import {UnCompress} from "./UnCompress";



export function FileMenu() {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);

    let div; // useEffect 是已经渲染过了再执行
    const pojo = showPrompt.data as FileMenuData;
    switch (pojo.type) {
        case FileMenuEnum.video:
            div = <VideoTrans />
            break;
        case FileMenuEnum.uncompress:
            div = <UnCompress />
            break;
    }
    return (div);
}
