import React, {useEffect, useState} from "react";
import {Excalidraw, MainMenu, serializeAsJSON} from "@excalidraw/excalidraw";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {fileHttp} from "../../../util/config";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {NotyFail, NotySucess} from "../../../util/noty";
import {useNavigate} from "react-router-dom";
import {Http} from "../../../util/http";
import {useTranslation} from "react-i18next";
import {RCode} from "../../../../../common/Result.pojo";

type ExcalidrawSceneData = {
    type?: string;
    version?: number;
    source?: string;
    elements?: any[];
    appState?: any;
    files?: Record<string, any>;
    libraryItems?: any[];
};

function parseScene(raw: any): ExcalidrawSceneData | null {
    if (!raw) {
        return null;
    }

    const value = typeof raw === "string" ? raw : raw.context ?? raw.data ?? raw;
    if (!value) {
        return null;
    }

    try {
        return typeof value === "string" ? JSON.parse(value) : value;
    } catch {
        return null;
    }
}

export default function ExcalidrawEditor() {
    const [excalidraw_editor, set_excalidraw_editor] = useRecoilState($stroe.excalidraw_editor);
    const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
    const [initialData, setInitialData] = useState<ExcalidrawSceneData | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const {t} = useTranslation();

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!excalidraw_editor?.url) {
                setInitialData(null);
                return;
            }

            setLoading(true);
            try {
                const rsq = await Http.get(excalidraw_editor.url);
                if (cancelled) {
                    return;
                }

                const scene = parseScene(rsq);
                if (!scene) {
                    throw new Error("invalid excalidraw scene");
                }
                setInitialData(scene);
            } catch {
                if (!cancelled) {
                    setInitialData(null);
                    NotyFail("Load Excalidraw file failed");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [excalidraw_editor?.url]);

    const close = () => {
        set_excalidraw_editor({});
        navigate(getRouterPath());
        excalidraw_editor?.close?.();
    };

    const save = async () => {
        if (!excalidrawAPI) {
            NotyFail("Editor is not ready");
            return;
        }

        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        const serialized = serializeAsJSON(elements, appState, files, "local");
        const data = JSON.parse(serialized);
        data.appState = {
            ...(data.appState ?? {}),
            zoom: appState.zoom,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize,
        };

        const rsq = await fileHttp.post(
            `save/${encodeURIComponent(getRouterAfter("file", getRouterPath()))}${excalidraw_editor.name}`,
            {context: JSON.stringify(data)},
        );

        if (rsq.code === RCode.Success) {
            NotySucess("保存成功");
        }
    };

    return (
        <div id={"excalidraw-container"}>
            <div className={"excalidraw-context"}>
                {loading && <div className="common-box common-box-center">Loading...</div>}
                {!loading && initialData && (
                    <Excalidraw
                        key={excalidraw_editor.url ?? "excalidraw"}
                        langCode="zh-CN"
                        initialData={initialData}
                        excalidrawAPI={(api) => setExcalidrawAPI(api)}
                        UIOptions={{
                            dockedSidebarBreakpoint: 0,
                        }}
                    >
                        <MainMenu>
                            <MainMenu.Item onSelect={close}>
                                {t("关闭")}
                            </MainMenu.Item>
                            <MainMenu.Item onSelect={save}>
                                {t("保存到服务器")}
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
                )}
            </div>
        </div>
    );
}
