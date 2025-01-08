import React, {useEffect, useState} from "react";
import {Excalidraw, Footer, MainMenu, Sidebar, WelcomeScreen} from "@excalidraw/excalidraw";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {fileHttp} from "../../../util/config";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {RCode} from "../../../../../common/Result.pojo";
import {NotyFail, NotySucess} from "../../../util/noty";
import {editor_data} from "../../../util/store.util";
import {useLocation, useNavigate} from "react-router-dom";


const loadStyles = async () => {
    // @ts-ignore
    // await import('tldraw/tldraw.css');
    // 可以在这里对加载的 CSS 进行一些处理，比如记录日志等
};

// let load_style = false;
export default function ExcalidrawEditor() {
    const [excalidraw_editor, set_excalidraw_editor] = useRecoilState($stroe.excalidraw_editor);
    const [excalidrawAPI, setExcalidrawAPI] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    // if (!load_style) {
    //     loadStyles();
    //     load_style = true;
    // }
    const getContext = async () => {
        const rsq = await fileHttp.get(`${encodeURIComponent(getRouterAfter('file', getRouterPath()))}${excalidraw_editor.name}`)
        return JSON.parse(rsq.data);
    }
    useEffect(() => {
        getContext()
    }, [excalidraw_editor]);
    const close = () => {
        set_excalidraw_editor({});
        navigate(getRouterPath());

    }
    const save = async () => {
        const elements = excalidrawAPI.getSceneElements();
        // const appState = excalidrawAPI.getAppState();
        const data = { elements };
        const rsq = await fileHttp.post(`save/${encodeURIComponent(getRouterAfter('file', getRouterPath()))}${excalidraw_editor.name}`, {context:JSON.stringify(data)})
        if (rsq.code === 0) {
            NotySucess("保存成功")
            // setEditorSetting({open: false, model: '', fileName: '', save: null})
        }
    }

    return <div id={"excalidraw-container"}>

        <div className={"excalidraw-context"}>
            <Excalidraw
                langCode="zh-CN"
                initialData={getContext()}
                excalidrawAPI={(api) => setExcalidrawAPI(api)}
                UIOptions={{
                    // this effectively makes the sidebar dockable on any screen size,
                    // ignoring if it fits or not
                    dockedSidebarBreakpoint: 0,
                }}
            >
                <MainMenu>
                    <MainMenu.Item onSelect={close}>
                        关闭
                    </MainMenu.Item>
                    <MainMenu.Item onSelect={save}>
                        保存到服务器
                    </MainMenu.Item>
                    <MainMenu.Group title="Excalidraw items">
                        <MainMenu.DefaultItems.LoadScene/>
                        <MainMenu.DefaultItems.Export/>
                        <MainMenu.DefaultItems.SaveToActiveFile/>
                        <MainMenu.DefaultItems.SaveAsImage/>
                        <MainMenu.DefaultItems.ClearCanvas/>
                        <MainMenu.DefaultItems.ToggleTheme/>
                        <MainMenu.DefaultItems.ChangeCanvasBackground/>
                    </MainMenu.Group>
                </MainMenu>
            </Excalidraw>
        </div>
    </div>
}