import React, {useEffect, useRef, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {VideoTrans} from "./VideoTrans";
import {UnCompress} from "./UnCompress";
import {SysSoftware} from "../../../../../common/req/setting.req";
import {NotyFail} from "../../../util/noty";
import {useTranslation} from "react-i18next";
import {FileMenuItem, OverlayTransparent} from "../../../../meta/component/Dashboard";
import {FileTypeEnum} from "../../../../../common/file.pojo";
import {use_file_to_running, user_click_file} from "../../../util/store.util";
import {DiskMountAction} from "./DiskMountAction";
import {run_workflow} from "./handle.service";


export function FileMenu() {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const {t} = useTranslation();
    const [items, setItems,] = useState([
        {r: t("以文本打开"),v:1},
        {r: t("以日志打开"),v:2}
    ]);
    // const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [studio, set_studio] = useRecoilState($stroe.studio);
    const {click_file} = user_click_file();
    const [image_editor, set_image_editor] = useRecoilState($stroe.image_editor);
    const [shell_file_log,set_file_log] = useRecoilState($stroe.log_viewer);
    const [workflow_show,set_workflow_show] = useRecoilState($stroe.workflow_realtime_show);

    const items_folder = [{r: t("以studio打开")}];
    const items_images = [{r: t("以图片编辑器打开")}];
    const {file_is_running} = use_file_to_running();

    const close = () => {
        setShowPrompt({show: false, type: '', overlay: false, data: {}});
    }
    let div; // useEffect 是已经渲染过了再执行
    const pojo = showPrompt.data;
    const textClick = async (v) => {
        if ( v===1 ) {
            const name = showPrompt.data.filename;
            click_file({name, model: "text",size:showPrompt.data.size,opt_shell:true});
            close();
        } else if ( v===2 ) {
            set_file_log({show: true,fileName: showPrompt.data.filename})
            close();
        } else if ( v===3 || v===4 || v===5 ) {
            if(v===5) {
                set_workflow_show({open:true,filename:showPrompt.data.filename});
            } else {
                run_workflow(showPrompt.data.filename,v);
            }
            close();
        }

    }
    switch (pojo.type) {
        case FileTypeEnum.video:
            if (!user_base_info.sysSoftWare || !user_base_info.sysSoftWare[SysSoftware.ffmpeg] || !user_base_info.sysSoftWare[SysSoftware.ffmpeg].installed) {
                NotyFail(t("找不到ffmpeg"))
                // setTimeout(()=>{
                //     close(); // 等下不然会报错 只要不是顺序的执行应都可以 0秒表示只是加入队列
                // },0)
                Promise.resolve().then(() => {
                    close(); // 这样也行 微队列
                });
                break;
            }
            div = <div onWheel={() => {
                close();
            }}>
                <VideoTrans/>
            </div>
            break;
        case FileTypeEnum.uncompress:
            div = <div onWheel={() => {
                close();
            }}>
                <UnCompress/>
            </div>
            break;
        case FileTypeEnum.dev:
            div = <div onWheel={() => {
                close();
            }}>
                <DiskMountAction/>
            </div>
            break;
        case FileTypeEnum.image:
            div = <div onWheel={() => {
                close();
            }}>
                <OverlayTransparent click={close} children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y}
                                                                          items={items_images} click={() => {
                    set_image_editor({path: showPrompt.data.path, name: showPrompt.data.filename});
                    close();
                }}/>}/>
            </div>
            break;
        case FileTypeEnum.folder:
            div = <div onWheel={() => {
                close();
            }}>
                <OverlayTransparent click={close} children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y}
                                                                          items={items_folder} click={() => {
                    set_studio({folder_path: showPrompt.data.path, name: showPrompt.data.filename});
                    close();
                }}/>}/>
            </div>
            break;
        case FileTypeEnum.studio_file:
        case FileTypeEnum.studio_folder:
        case FileTypeEnum.directory:
            // 自定义的
            div = <div onWheel={() => {
                close();
            }}>
                <OverlayTransparent click={close}
                                    children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y} items={showPrompt.data.items}
                                                            click={showPrompt.data.textClick}/>}/>
            </div>
            break;
        case FileTypeEnum.unknow:
        default:
        {
            if(pojo.filename.endsWith(".workflow.yml") || pojo.filename.endsWith(".act")) {
                if(file_is_running(pojo.filename)) {
                    items.unshift({r: t("停止workflow"),v:4})
                    items.unshift({r: t("实时查看workflow"),v:5})
                } else {
                    items.unshift({r: t("运行workflow"),v:3})
                }
            }
            div = <div onWheel={() => {
                close();
            }}>
                <OverlayTransparent click={close}
                                    children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y} items={items}
                                                            click={textClick}/>}/>
            </div>
        }
    }
    return (div);
}


