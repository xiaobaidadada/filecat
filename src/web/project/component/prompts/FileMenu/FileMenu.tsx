import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {FileMenuData} from "../../../../../common/FileMenuType";
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
import {FileTypeEnum} from "../../../../../common/file.pojo";
import {user_click_file} from "../../../util/store.util";



export function FileMenu() {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const { t } = useTranslation();
    const [items, setItems,] = useState([{r:t("以文本打开")}]);
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [studio, set_studio] = useRecoilState($stroe.studio);
    const { click_file } = user_click_file();

    const items_folder = [{r:t("以studio打开")}];

    const close = ()=>{
        setShowPrompt({show: false, type: '', overlay: false,data: {}});
    }
    let div; // useEffect 是已经渲染过了再执行
    const pojo = showPrompt.data as FileMenuData;
    const textClick = async (v)=> {
        const name = showPrompt.data.filename;
        click_file({name,model:"text"});
        close();
    }
    switch (pojo.type) {
        case FileTypeEnum.video:
            if (!user_base_info.sysSoftWare || !user_base_info.sysSoftWare[SysSoftware.ffmpeg] || !user_base_info.sysSoftWare[SysSoftware.ffmpeg].installed) {
                NotyFail(t("找不到ffmpeg"))
                break;
            }
            div = <VideoTrans />
            break;
        case FileTypeEnum.uncompress:
            div = <UnCompress />
            break;
        case FileTypeEnum.folder:
            div = <div onWheel={()=>{
                close();
            }}>
                <OverlayTransparent click={close}  children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y} items={items_folder} click={()=>{
                    set_studio({folder_path:showPrompt.data.path,name:showPrompt.data.filename});
                }}/>}/>
            </div>
            break;
        case FileTypeEnum.unknow:
        default:
            div = <div onWheel={()=>{
                close();
            }}>
                <OverlayTransparent click={close}  children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y} items={items} click={textClick}/>}/>
            </div>
    }
    return (div);
}

export function FileMenuItem(props:{x:number,y:number,items?: any,click?: (v) => void}) {
    return <div
        style={{
            position: 'absolute',
            top: `${props.y}px`,
            left: `${props.x}px`,
            backgroundColor: 'white',
            // border: '1px solid black',
            padding: '5px',
            zIndex: 999,
        }}
    >
        <Dropdown items={props.items} click={props.click}/>
    </div>
}
