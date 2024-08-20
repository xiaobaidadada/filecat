import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {FileMenuData, FileMenuEnum} from "./FileMenuType";
import {VideoTrans} from "./VideoTrans";
import {UnCompress} from "./UnCompress";
import {SysSoftware} from "../../../../../common/req/setting.req";
import {NotyFail} from "../../../util/noty";
import {useTranslation} from "react-i18next";
import {Dropdown, DropdownItemsPojo, OverlayTransparent} from "../../../../meta/component/Dashboard";
import {fileHttp} from "../../../util/config";
import {getRouterAfter} from "../../../util/WebPath";
import {RCode} from "../../../../../common/Result.pojo";
import {saveTxtReq} from "../../../../../common/req/file.req";
import {getEditModelType} from "../../../../../common/StringUtil";



export function FileMenu() {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const { t } = useTranslation();
    const [items, setItems,] = useState([{r:t("以文本打开")}]);
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [editorValue, setEditorValue] = useRecoilState($stroe.editorValue)

    const close = ()=>{
        setShowPrompt({show: false, type: '', overlay: false,data: {}});
    }
    let div; // useEffect 是已经渲染过了再执行
    const pojo = showPrompt.data as FileMenuData;
    const textClick = async (v)=> {
        const name = showPrompt.data.filename;
        const rsq = await fileHttp.get(`${getRouterAfter('file', location.pathname)}${name}`)
        if (rsq.code === RCode.File_Max) {
            NotyFail("超过20MB");
            return;
        }
        let model = getEditModelType(name);
        if (!model) {
            model = "text"
        }
        setEditorSetting({
            model,
            open: true,
            fileName: name,
            save: async (context) => {
                const data: saveTxtReq = {
                    context
                }
                const rsq = await fileHttp.post(`save/${getRouterAfter('file', location.pathname)}${name}`, data)
                if (rsq.code === 0) {
                    setEditorValue('')
                    setEditorSetting({open: false, model: '', fileName: '', save: null})
                }
            }
        })
        setEditorValue(rsq.data)
        close();
    }
    switch (pojo.type) {
        case FileMenuEnum.video:
            if (!user_base_info.sysSoftWare || !user_base_info.sysSoftWare[SysSoftware.ffmpeg] || !user_base_info.sysSoftWare[SysSoftware.ffmpeg].installed) {
                NotyFail(t("找不到ffmpeg"))
                break;
            }
            div = <VideoTrans />
            break;
        case FileMenuEnum.uncompress:
            div = <UnCompress />
            break;
        case FileMenuEnum.unknown:
            div = <div onWheel={()=>{
                close();
            }}>
                <OverlayTransparent click={close}  children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y} items={items} click={textClick}/>}/>
            </div>

    }
    return (div);
}

export function FileMenuItem(props:{x:number,y:number,items?: DropdownItemsPojo,click?: (v) => void}) {
    return <div
        style={{
            position: 'absolute',
            top: `${props.y}px`,
            left: `${props.x}px`,
            backgroundColor: 'white',
            // border: '1px solid black',
            padding: '5px',
            zIndex: 999999,
        }}
    >
        <Dropdown items={props.items} click={props.click}/>
    </div>
}
