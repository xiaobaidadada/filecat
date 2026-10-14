import React, {useEffect, useRef, useState} from "react";
import {Http} from "../../../util/http";
import {fileHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {RCode} from "../../../../../common/Result.pojo";
import {useTranslation} from "react-i18next";
import MindMap from "simple-mind-map";
// 库的样式，必须引入，否则连线/节点都不可见
import "simple-mind-map/dist/simpleMindMap.esm.css";

/**
 * 基于 simple-mind-map 的思维导图编辑器（.mind）。
 *
 * 文件内容就是库自己的完整数据（getData(true) 的结果）：
 *   { layout, root: {data:{text}, children:[]}, theme:{template,config}, view:{...} }
 *
 * 通过 shell 插槽区分两种外壳：Studio 内嵌 / 全屏浮层共用同一份逻辑。
 */

export type MindHandle = {
    /** 立即保存，返回是否成功 */
    save: () => Promise<boolean>;
    /** 是否有未保存的改动 */
    is_dirty: () => boolean;
};

type Props = {
    /** 读取内容的地址 */
    url: string;
    /** 切换文件时用于重建编辑器的 key */
    reset_key?: string;
    /** 保存实现：由外壳决定写到哪 */
    on_save: (context: string) => Promise<boolean>;
    on_saved?: () => void;
    on_dirty?: (dirty: boolean) => void;
    register?: (handle: MindHandle) => void;
    /** 顶部额外内容（如全屏外壳的文件名、保存、关闭按钮） */
    header?: React.ReactNode;
    /** 是否为全屏浮层模式（影响容器样式类名） */
    fullscreen?: boolean;
};

export default function MindMapEditor(props: Props) {
    const {t} = useTranslation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    /** 缩放百分比，仅用于显示 */
    const [scale, setScale] = useState(100);

    const containerRef = useRef<HTMLDivElement | null>(null);
    /** simple-mind-map 实例 */
    const mindRef = useRef<any>(null);
    const dirtyRef = useRef(false);
    const latest = useRef({props});
    latest.current = {props};

    /** 标记内容已变更（供外壳显示保存按钮 / 关闭时提示） */
    const markDirty = () => {
        if (!dirtyRef.current) {
            dirtyRef.current = true;
            latest.current.props.on_dirty?.(true);
        }
    };

    /** 取当前导图数据（含布局/主题/视图），直接作为 .mind 文件内容 */
    const buildContext = (): string => {
        const mm = mindRef.current;
        if (!mm) {
            return "";
        }
        return JSON.stringify(mm.getData(true));
    };

    const save = async (): Promise<boolean> => {
        const mm = mindRef.current;
        if (!mm) {
            NotyFail(t("编辑器尚未就绪"));
            return false;
        }
        const ok = await latest.current.props.on_save(buildContext());
        if (ok) {
            dirtyRef.current = false;
            latest.current.props.on_dirty?.(false);
            latest.current.props.on_saved?.();
        }
        return ok;
    };

    // 暴露句柄给外壳
    useEffect(() => {
        props.register?.({save, is_dirty: () => dirtyRef.current});
        // save 内部走 latest.current，注册一次即可
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.register]);

    // 初始化 / 切换文件
    useEffect(() => {
        const el = containerRef.current;
        if (!el || !props.url) {
            return;
        }
        let cancelled = false;
        // 初始化期间创建的定时器，卸载时统一清理
        const timers: number[] = [];
        // 销毁旧实例，避免切换文件时残留
        mindRef.current?.destroy?.();
        mindRef.current = null;
        dirtyRef.current = false;
        setLoading(true);
        setError("");

        const init = async (data: any) => {
            if (cancelled || !containerRef.current) {
                return;
            }
            const mm = new MindMap({
                el: containerRef.current,
                // 没有内容时给一个根节点，保证打开即可编辑
                data: data ?? {data: {text: t("中心主题")}},
                // 首次加载自适应画布
                fit: true,
                // 节点拖动会直接连线；这里保留库默认的拖拽调整结构的能力
                enableFreeDrag: false,
            });
            mindRef.current = mm;
            setLoading(false);

            // 初始化完成后再挂监听：库在构造/首次渲染时也会触发 data_change，
            // 若在此期间监听会导致刚打开就被标记为「有未保存的修改」。
            // 用 rAF 等首次渲染与历史入栈结束，并额外忽略掉随后一小段时间内的
            // 自动触发的 data_change（fit 视图、历史入栈等），避免误判为「已修改」。
            const attach = () => {
                let ready = false;
                // 稍后再开始接受 data_change，确保初始化引发的变更都已过去
                const timer = window.setTimeout(() => {
                    if (!cancelled) {
                        ready = true;
                    }
                }, 400);
                timers.push(timer);
                mm.on("data_change", () => {
                    if (!ready) {
                        return;
                    }
                    markDirty();
                    setScale(readScale(mm));
                });
                // 视图变化（缩放/平移）只同步百分比显示，不算「未保存的修改」
                mm.on("view_data_change", () => {
                    setScale(readScale(mm));
                });
                // 库内部报错统一打印，避免静默失败
                mm.on("error", (code: string, err: any) => {
                    console.error("[mind]", code, err);
                });
                setScale(readScale(mm));
            };
            window.requestAnimationFrame(() => {
                if (!cancelled) {
                    attach();
                }
            });
        };

        (async () => {
            try {
                const rsq = await Http.get(props.url);
                if (cancelled) {
                    return;
                }
                let data: any = null;
                // 后端把文件内容原样返回（字符串）；空文件/非法 JSON 时回退到空导图
                if (typeof rsq === "string" && rsq.trim()) {
                    try {
                        data = JSON.parse(rsq);
                    } catch {
                        data = null;
                    }
                }
                data = toSimpleMindData(data);
                await init(data);
            } catch (e) {
                if (!cancelled) {
                    setLoading(false);
                    setError(t("加载思维导图失败"));
                    NotyFail(t("加载思维导图失败"));
                }
            }
        })();

        return () => {
            cancelled = true;
            timers.forEach((t) => window.clearTimeout(t));
            mindRef.current?.destroy?.();
            mindRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.url]);

    // Ctrl+S 保存：捕获阶段拦截，避免被浏览器/外层抢走
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isSave = (e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S" || e.keyCode === 83);
            if (!isSave) {
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
    /** 缩放到指定百分比（0.25 ~ 4） */
    const setZoom = (next: number) => {
        const mm = mindRef.current;
        if (!mm) {
            return;
        }
        const v = Math.min(4, Math.max(0.25, next));
        mm.view.setScale(v);
        setScale(Math.round(v * 100));
    };

    return (
        <div className={"mind-wrap" + (props.fullscreen ? " mind-wrap--full" : "")}>
            {/* 外层提供的头部（全屏时是文件名+保存+关闭） */}
            {props.header}
            <div className="mind-toolbar">
                <button type="button" className="mind-btn"
                        title={t("添加子节点") + " (Tab)"}
                        onClick={() => mindRef.current?.execCommand?.("INSERT_CHILD_NODE")}>
                    <span className="material-icons">account_tree</span>
                </button>
                <button type="button" className="mind-btn"
                        title={t("添加同级节点") + " (Enter)"}
                        onClick={() => mindRef.current?.execCommand?.("INSERT_NODE")}>
                    <span className="material-icons">subdirectory_arrow_right</span>
                </button>
                <button type="button" className="mind-btn"
                        title={t("删除节点") + " (Delete)"}
                        onClick={() => mindRef.current?.execCommand?.("REMOVE_NODE")}>
                    <span className="material-icons">delete</span>
                </button>
                <span className="mind-toolbar__gap"/>
                <span className="mind-toolbar__zoom">{scale}%</span>
                <button type="button" className="mind-btn" title={t("缩小")}
                        onClick={() => setZoom(readScale(mindRef.current) / 100 - 0.2)}>
                    <span className="material-icons">remove</span>
                </button>
                <button type="button" className="mind-btn" title={t("放大")}
                        onClick={() => setZoom(readScale(mindRef.current) / 100 + 0.2)}>
                    <span className="material-icons">add</span>
                </button>
                <button type="button" className="mind-btn" title={t("适应窗口")}
                        onClick={() => mindRef.current?.view?.fit?.()}>
                    <span className="material-icons">fit_screen</span>
                </button>
            </div>
            <div className="mind-canvas">
                {/* simple-mind-map 的渲染容器 */}
                <div className="mind-mount" ref={containerRef}></div>
                {loading && <div className="mind-mask">Loading...</div>}
                {error && <div className="mind-mask">{error}</div>}
            </div>
        </div>
    );
}

/** 从视图实例读取当前缩放百分比（库没有 getScale 方法，要通过变换数据取） */
function readScale(mm: any): number {
    const s = mm?.view?.getTransformData?.()?.state?.scale;
    return typeof s === "number" && s > 0 ? Math.round(s * 100) : 100;
}

/** 把文件内容规整成 simple-mind-map 能吃的节点数据。
 * 兼容两种格式：
 *   1. 本库自己的完整数据（含 root 字段）
 *   2. 更早的自研格式 {version, root:{id,text,children}} —— 转成本库的 {data:{text},children}
 */
function toSimpleMindData(input: any): any {
    if (!input || typeof input !== "object") {
        return null;
    }
    // 本库格式：root 下是一个节点对象（含 data.text）
    if (input.root && typeof input.root === "object") {
        if (input.root.data) {
            // 已经是本库节点结构，直接返回
            return input.root;
        }
        // 旧自研格式：节点是 {id,text,children}
        return convertLegacyNode(input.root);
    }
    // 可能直接就是节点对象
    if (input.data && typeof input.data === "object") {
        return input;
    }
    return convertLegacyNode(input);
}

/** 把旧自研节点（text/children）转成 simple-mind-map 节点（data.text/children） */
function convertLegacyNode(n: any): any {
    return {
        data: {
            text: typeof n?.text === "string" ? n.text : "",
            ...(n?.note ? {note: n.note} : {}),
        },
        children: Array.isArray(n?.children) ? n.children.map(convertLegacyNode) : [],
    };
}
