import React, {useEffect, useRef, useState} from "react";
import {Excalidraw, MainMenu, serializeAsJSON} from "@excalidraw/excalidraw";
import {Http} from "../../../util/http";
import {fileHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {RCode} from "../../../../../common/Result.pojo";
import {useTranslation} from "react-i18next";
import {parseScene} from "./ExcalidrawEditor";
import "@excalidraw/excalidraw/index.css";

/**
 * 内嵌（非全屏浮层）的 Excalidraw 编辑器。
 *
 * 与 ExcalidrawEditor 的区别：本组件不依赖全局 store，由调用方直接给 url / path，
 * 保存时把 JSON 回调给调用方（Studio 有自己的保存链路），因此可以直接嵌进其它页面。
 */
export type ExcalidrawInlineHandle = {
    /** 立即保存当前画布内容，返回是否成功 */
    save: () => Promise<boolean>;
    /** 是否有未保存的改动 */
    is_dirty: () => boolean;
};

type Props = {
    /** 读取场景 JSON 的地址（fileHttp.get 使用） */
    url: string;
    /** 保存接口用的文件路径（Studio 里的 edit_file_path，目录部分会自动 encode） */
    save_path: string;
    /** 切换文件时用于强制重建编辑器的 key（通常是路径） */
    reset_key?: string;
    /** 保存成功后回调（用于清掉外层的脏标记） */
    on_saved?: () => void;
    /** 画布内容变化时回调（用于让外层 Header 显示保存按钮） */
    on_dirty?: (dirty: boolean) => void;
    /** 把操作句柄暴露给外层（如 Header 的保存按钮） */
    register?: (handle: ExcalidrawInlineHandle) => void;
};

export default function ExcalidrawInline(props: Props) {
    const {t} = useTranslation();
    const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
    const [initialData, setInitialData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    // 脏标记：Excalidraw 的 onChange 在初始化时也会触发一次，用这个标志跳过首次
    const dirtyRef = useRef(false);
    const mountedRef = useRef(false);

    // 用 ref 承接最新的 props/API，保证暴露出去的 save 始终可用且不产生过期闭包
    const latest = useRef({api: excalidrawAPI, props});
    latest.current = {api: excalidrawAPI, props};

    /** 把画布序列化成后端存储用的 JSON 字符串 */
    const buildData = () => {
        const api = latest.current.api;
        if (!api) {
            return null;
        }
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const files = api.getFiles();
        const serialized = serializeAsJSON(elements, appState, files, "local");
        const data = JSON.parse(serialized);
        // 只保留视图相关字段：这几项决定重新打开时的缩放与位置
        data.appState = {
            ...(data.appState ?? {}),
            zoom: appState.zoom,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize,
        };
        return JSON.stringify(data);
    };

    const save = async (): Promise<boolean> => {
        const context = buildData();
        if (context === null) {
            NotyFail(t("编辑器尚未就绪"));
            return false;
        }
        const rsq = await fileHttp.post(`save/${encodeURIComponent(latest.current.props.save_path)}`, {context});
        if (rsq.code === RCode.Success) {
            dirtyRef.current = false;
            latest.current.props.on_dirty?.(false);
            latest.current.props.on_saved?.();
            NotySuccess(t("保存成功"));
            return true;
        }
        return false;
    };

    // 向调用方暴露句柄
    useEffect(() => {
        props.register?.({
            save,
            is_dirty: () => dirtyRef.current,
        });
        // save 每次渲染都会重建，但句柄内部都走 latest.current，所以只需注册一次
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.register]);

    // 加载场景：切换文件时重新拉取
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!props.url) {
                setInitialData(null);
                return;
            }
            setLoading(true);
            try {
                const rsq = await Http.get(props.url);
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
                    NotyFail(t("加载画板失败"));
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
    }, [props.url]);

    // Ctrl+S 保存：捕获阶段拦截，并阻断 Excalidraw 自身把 Ctrl+S 当作“另存为文件”
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isSaveKey = (e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S" || e.keyCode === 83);
            if (!isSaveKey) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            save();
        };
        window.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            document.removeEventListener("keydown", onKeyDown, true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={"excalidraw-inline"}>
            {loading && <div className="common-box common-box-center">Loading...</div>}
            {!loading && initialData && (
                <Excalidraw
                    key={props.reset_key ?? props.url ?? "excalidraw"}
                    langCode="zh-CN"
                    initialData={initialData}
                    excalidrawAPI={(api) => setExcalidrawAPI(api)}
                    // 内容变化标记为脏，让外层 Header 出现保存按钮
                    onChange={() => {
                        if (!mountedRef.current) {
                            // 首次渲染 Excalidraw 也会回调一次 onChange，这里跳过
                            mountedRef.current = true;
                            return;
                        }
                        if (!dirtyRef.current) {
                            dirtyRef.current = true;
                            latest.current.props.on_dirty?.(true);
                        }
                    }}
                    onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S" || event.keyCode === 83)) {
                            event.preventDefault();
                            save();
                            return true;
                        }
                        return false;
                    }}
                    UIOptions={{
                        dockedSidebarBreakpoint: 0,
                    }}
                >
                    <MainMenu>
                        {/* 内嵌模式不需要“关闭”，关闭由外层 Header 负责 */}
                        <MainMenu.Item onSelect={() => save()}>
                            {t("保存到服务器")}
                        </MainMenu.Item>
                        <MainMenu.Group title="Excalidraw items">
                            <MainMenu.DefaultItems.Export/>
                            <MainMenu.DefaultItems.SaveAsImage/>
                            <MainMenu.DefaultItems.ClearCanvas/>
                            <MainMenu.DefaultItems.ToggleTheme/>
                            <MainMenu.DefaultItems.ChangeCanvasBackground/>
                        </MainMenu.Group>
                    </MainMenu>
                </Excalidraw>
            )}
        </div>
    );
}
