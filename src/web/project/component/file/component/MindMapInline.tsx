import React, {useEffect, useRef, useState} from "react";
import {Http} from "../../../util/http";
import {fileHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {RCode} from "../../../../../common/Result.pojo";
import {useTranslation} from "react-i18next";
import MindMap from "simple-mind-map/full.js";
// 库的样式，必须引入，否则连线/节点都不可见
import "simple-mind-map/dist/simpleMindMap.esm.css";
import {MIND_ZOOM_OPTIONS, to_simple_mind_data} from "./md_editor/mind_graph";
import {register_mind_themes} from "./md_editor/mind_theme";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import PromptInput from "../../../../meta/component/PromptInput";
import {FileMenuItem, OverlayTransparent} from "../../../../meta/component/Dashboard";
import {Icon} from "../../../../meta/component/Button";
import {MaterialIcon} from "material-icons";

// 补充主题要在实例化前注册好（库只有 default 一套内置主题）
register_mind_themes(MindMap);

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

/** 节点右键菜单定义。库不提供菜单 UI，只提供命令，菜单由我们自己渲染。
 *  cmd 是命令名，children 有值时渲染成二级菜单 */
type MindMenuDef = {
    cmd: string;
    icon: MaterialIcon;
    label: string;
    children?: MindMenuDef[];
};

const NODE_MENU: MindMenuDef[] = [
    {cmd: "INSERT_CHILD_NODE", icon: "account_tree", label: "添加子节点"},
    {cmd: "INSERT_NODE", icon: "subdirectory_arrow_right", label: "添加同级节点"},
    {cmd: "INSERT_PARENT_NODE", icon: "arrow_upward", label: "插入父节点"},
    {cmd: "CUT_NODE", icon: "content_cut", label: "剪切"},
    {cmd: "PASTE_NODE", icon: "content_paste", label: "粘贴"},
    {cmd: "REMOVE_NODE", icon: "delete", label: "删除节点"},
    // 插入类集中在子菜单，对应删除项放在同一个子菜单里成对出现
    {
        cmd: "INSERT_GROUP", icon: "add_circle_outline", label: "插入",
        children: [
            {cmd: "SET_NODE_ICON", icon: "emoji_emotions", label: "插入图标"},
            {cmd: "REMOVE_NODE_ICON", icon: "format_clear", label: "删除图标"},
            {cmd: "SET_NODE_NOTE", icon: "sticky_note_2", label: "节点备注"},
            {cmd: "REMOVE_NODE_NOTE", icon: "speaker_notes_off", label: "删除备注"},
            {cmd: "SET_NODE_TAG", icon: "sell", label: "节点标签"},
            {cmd: "REMOVE_NODE_TAG", icon: "label_off", label: "删除标签"},
            {cmd: "SET_NODE_HYPERLINK", icon: "link", label: "插入超链接"},
            {cmd: "REMOVE_NODE_HYPERLINK", icon: "link_off", label: "删除超链接"},
        ],
    },
    // 概要：选中多个同级节点后执行，会生成一个跨这些节点的新节点
    {cmd: "ADD_GENERALIZATION", icon: "call_merge", label: "添加概要"},
    {cmd: "REMOVE_GENERALIZATION", icon: "call_split", label: "删除概要"},
];

/** 结构（布局）选项，与库的 layout 常量一致 */
const MIND_LAYOUTS = [
    {value: "logicalStructure", label: "逻辑结构图"},
    {value: "mindMap", label: "思维导图"},
    {value: "organizationStructure", label: "组织结构图"},
    {value: "catalogOrganization", label: "目录组织图"},
    {value: "timeline", label: "时间轴（左）"},
    {value: "timeline2", label: "时间轴（下）"},
    {value: "timeline3", label: "时间轴（上）"},
    {value: "verticalTimeline", label: "时间轴（竖）"},
    {value: "fishbone", label: "鱼骨图"},
    {value: "rightFishbone", label: "鱼骨图（右）"},
];

/** 连线风格 */
const MIND_LINE_STYLES = [
    {value: "curve", label: "曲线"},
    {value: "straight", label: "直线"},
    {value: "direct", label: "直连"},
];

/** 内置主题（库只带 default，其余在 mind_theme.ts 里补） */
const MIND_THEMES = [
    {value: "default", label: "默认主题"},
    {value: "classic", label: "经典"},
    {value: "dark", label: "暗色"},
    {value: "simple", label: "极简"},
    {value: "colorful", label: "缤纷"},
];

/** 可插入节点的图标分组，由 simple-mind-map/full.js 挂在 MindMap.iconList 上 */
const MIND_ICONS: any[] = (MindMap as any).iconList || [];



type Props = {
    /** 读取内容的地址（与 data 二选一） */
    url?: string;
    /**
     * 直接提供的内容（与 url 二选一）。
     * 用于代码块等「数据来自外部、不落文件」的场景：给了 data 就不再请求 url。
     */
    data?: string;
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
    /** 当前主题名，跟随导图数据里的 theme.template */
    const [themeName, setThemeName] = useState("default");
    const [, set_prompt_card] = useAtom($stroe.prompt_card);
    /** 当前布局，跟随导图数据里的 layout */
    const [layout, setLayout] = useState("mindMap");
    /** 右键菜单：位置 + 目标节点 */
    const [menu, setMenu] = useState<{ x: number; y: number; node: any } | null>(null);

    const containerRef = useRef<HTMLDivElement | null>(null);
    /** 画布外层，用于挂右键菜单的原生监听 */
    const wrapRef = useRef<HTMLDivElement | null>(null);
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
        if (!el) {
            return;
        }
        // url 与 data 至少有一个，否则没有内容可加载
        if (!props.url && props.data === undefined) {
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

        const init = async (raw: any) => {
            if (cancelled || !containerRef.current) {
                return;
            }
            // 拆成「节点树」和「完整数据」两部分：
            // 构造函数只认 opt.data（纯节点树）+ opt.layout/opt.theme（字符串名），
            // 完整数据里的 layout/theme/view 必须走 setFullData 才会生效，
            // 否则每次打开都会退回默认布局和默认主题。
            const full = raw && raw.root ? raw : null;
            const tree = full ? full.root : (raw ?? {data: {text: t("中心主题")}});
            const mm = new MindMap({
                el: containerRef.current,
                data: tree,
                // 首次加载自适应画布
                fit: true,
                // 双击空白回到根节点（官方默认行为）
                enableDblclickBackToRootNode: true,
                // 快捷键只在鼠标位于画布内时响应，避免和页面其它输入框抢键
                enableShortcutOnlyWhenMouseInSvg: true,
                // 拖拽节点时鼠标移到画布边缘自动平移
                autoMoveWhenMouseInEdgeOnDrag: true,
                // 粘贴图片转 dataURL 存进节点
                ...MIND_ZOOM_OPTIONS,
            });
            mindRef.current = mm;
            // 布局/主题/视图要在实例创建后按完整数据恢复
            if (full) {
                mm.setFullData(full);
            }
            setLoading(false);
            // 数据里带主题就同步到下拉框，否则显示默认
            setThemeName(mm.getTheme?.() || "default");
            setLayout(mm.getLayout?.() || "mindMap");

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
                let raw: any = null;
                if (props.data !== undefined) {
                    // 外部直接给内容（代码块场景），不请求网络
                    raw = props.data;
                } else {
                    const rsq = await Http.get(props.url as string);
                    if (cancelled) {
                        return;
                    }
                    raw = rsq;
                }
                let data: any = null;
                // 内容原样返回（字符串）；空/非法 JSON 时回退到空导图
                if (typeof raw === "string" && raw.trim()) {
                    try {
                        data = JSON.parse(raw);
                    } catch {
                        data = null;
                    }
                } else if (raw && typeof raw === "object") {
                    data = raw;
                }
                data = to_simple_mind_data(data);
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
    }, [props.url, props.data]);

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

    /** 取当前激活节点，没有激活节点时提示并返回 null */
    const active_node = (): any => {
        const node = mindRef.current?.renderer?.activeNodeList?.[0];
        if (!node) {
            NotyFail(t("请先选中一个节点"));
            return null;
        }
        return node;
    };

    /** 文本类字段的弹框配置：插入时预填已有值，删除时直接清空 */
    const TEXT_FIELDS: Record<string, { title: string, placeholder: string, get: (node: any) => string }> = {
        SET_NODE_NOTE: {
            title: "节点备注",
            placeholder: "请输入节点备注",
            get: (node) => node.getData("note") || "",
        },
        SET_NODE_TAG: {
            title: "节点标签",
            placeholder: "请输入节点标签，多个用逗号分隔",
            get: (node) => (node.getData("tag") || []).join(","),
        },
        SET_NODE_HYPERLINK: {
            title: "插入超链接",
            placeholder: "请输入链接地址",
            get: (node) => node.getData("hyperlink") || "",
        },
    };

    /** 弹框里输入备注 / 标签 / 超链接，确认后写回节点 */
    const edit_node_text = (node: any, cmd: string) => {
        if (!node) {
            return;
        }
        const cfg = TEXT_FIELDS[cmd];
        const init = cfg.get(node);
        // 输入值暂存在局部变量，点确认时再统一提交
        let value = init;
        set_prompt_card({
            open: true,
            title: t(cfg.title),
            context_div: (
                <PromptInput
                    initValue={init}
                    placeholder={t(cfg.placeholder)}
                    onChange={(v) => value = v}
                />
            ),
            confirm: () => {
                const v = value.trim();
                if (cmd === "SET_NODE_TAG") {
                    mindRef.current.execCommand(cmd, node,
                        v.split(/[,，]/).map(s => s.trim()).filter(Boolean));
                } else if (cmd === "SET_NODE_HYPERLINK") {
                    mindRef.current.execCommand(cmd, node, v, v);
                } else {
                    mindRef.current.execCommand(cmd, node, v);
                }
                set_prompt_card({open: false});
                markDirty();
            },
            cancel: () => set_prompt_card({open: false}),
        });
    };

    /** 弹框里选图标，点一个直接写入节点 */
    const pick_icon = (node: any) => {
        if (!node) {
            return;
        }
        const exist = Array.isArray(node.getData("icon")) ? node.getData("icon") : [];
        set_prompt_card({
            open: true,
            title: t("插入图标"),
            context_div: (
                <div className="prompt-icon-list">
                    {MIND_ICONS.flatMap((group: any) =>
                        (group.list || []).map((it: any, i: number) => (
                            <button type="button" key={group.type + i} className="prompt-icon-list__item"
                                    title={it.name}
                                    dangerouslySetInnerHTML={{__html: it.icon}}
                                    onClick={() => {
                                        // 库里存的是 `type_图标名` 字符串，渲染时按 _ 拆开查图标表
                                        mindRef.current.execCommand("SET_NODE_ICON", node,
                                            [...exist, `${group.type}_${it.name}`]);
                                        set_prompt_card({open: false});
                                        markDirty();
                                    }}/>
                        ))
                    )}
                </div>
            ),
            cancel: () => set_prompt_card({open: false}),
        });
    };

    /** 删除类命令：清空对应字段，不需要用户输入 */
    const remove_node_data = (node: any, cmd: string) => {
        if (!node) {
            return;
        }
        if (cmd === "REMOVE_NODE_ICON") {
            mindRef.current.execCommand("SET_NODE_ICON", node, []);
        } else if (cmd === "REMOVE_NODE_NOTE") {
            mindRef.current.execCommand("SET_NODE_NOTE", node, "");
        } else if (cmd === "REMOVE_NODE_TAG") {
            mindRef.current.execCommand("SET_NODE_TAG", node, []);
        } else if (cmd === "REMOVE_NODE_HYPERLINK") {
            mindRef.current.execCommand("SET_NODE_HYPERLINK", node, "", "");
        }
        markDirty();
    };


    /** 添加概要：把选中的多个同级节点合并到一个新节点。
     *  库的 ADD_GENERALIZATION 无参调用即可（内部读 activeNodeList），
     *  但它要求至少一个非根、非概要节点，不满足时静默无反应，这里补个提示。 */
    const addGeneralization = () => {
        const mm = mindRef.current;
        if (!mm) {
            return;
        }
        const list = (mm.renderer?.activeNodeList || []).filter(
            (n: any) => !n.isRoot && !n.isGeneralization
        );
        if (list.length === 0) {
            NotyFail(t("请先选中要合并的节点（按住 Ctrl 拖框可多选）"));
            return;
        }
        mm.execCommand("ADD_GENERALIZATION");
        markDirty();
    };

    /** 右键菜单打开时，点击别处就关掉。
     *  用 setTimeout 注册：右键操作本身会附带一次 click，直接同步注册会立刻把菜单关掉 */
    useEffect(() => {
        if (!menu) {
            return;
        }
        const close = () => setMenu(null);
        const timer = window.setTimeout(() => {
            window.addEventListener("click", close);
            window.addEventListener("blur", close);
        }, 0);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener("click", close);
            window.removeEventListener("blur", close);
        };
    }, [menu]);

    /** 右键菜单：记录位置和当前节点。
     *  SVG 上库自己也监听 contextmenu，React 合成事件到达前可能已被拦截，
     *  所以挂在容器上并用捕获阶段监听原生事件。 */
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) {
            return;
        }
        const onCtx = (e: MouseEvent) => {
            const node = mindRef.current?.renderer?.activeNodeList?.[0];
            if (!node) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            setMenu({x: e.clientX, y: e.clientY, node});
        };
        el.addEventListener("contextmenu", onCtx, true);
        return () => el.removeEventListener("contextmenu", onCtx, true);
    }, []);

    /** 把菜单定义转成项目 Dropdown 需要的结构，文案在这里翻译 */
    const menu_items = (defs: MindMenuDef[]): any[] => defs.map(it => ({
        v: it.cmd,
        r: (
            <div className={"common-tag-center mind-menu-row"}>
                <Icon icon={it.icon} not_use_icon_style={true}/>
                <span>{t(it.label)}</span>
            </div>
        ),
        items: it.children ? menu_items(it.children) : undefined,
    }));
    /** 执行菜单里的命令 */
    const run_menu = (cmd: string) => {
        const mm = mindRef.current;
        const m = menu;
        if (!mm || !m) {
            return;
        }
        setMenu(null);
        // 概要命令内部读 activeNodeList，不能传节点进去
        if (cmd === "ADD_GENERALIZATION" || cmd === "REMOVE_GENERALIZATION") {
            mm.execCommand(cmd);
            markDirty();
            return;
        }
        // 备注 / 标签 / 超链接需要用户输入，走全局弹框
        if (cmd === "SET_NODE_NOTE" || cmd === "SET_NODE_TAG" || cmd === "SET_NODE_HYPERLINK") {
            edit_node_text(m.node, cmd);
            return;
        }
        // 图标走弹框选择
        if (cmd === "SET_NODE_ICON") {
            pick_icon(m.node);
            return;
        }
        // 删除类直接清空字段
        if (cmd.startsWith("REMOVE_NODE_")) {
            remove_node_data(m.node, cmd);
            return;
        }
        mm.execCommand(cmd, m.node);
        markDirty();
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
                <span className="mind-toolbar__sep"/>
                <button type="button" className="mind-btn" title={t("撤销") + " (Ctrl+Z)"}
                        onClick={() => mindRef.current?.execCommand?.("BACK")}>
                    <span className="material-icons">undo</span>
                </button>
                <button type="button" className="mind-btn" title={t("重做") + " (Ctrl+Y)"}
                        onClick={() => mindRef.current?.execCommand?.("FORWARD")}>
                    <span className="material-icons">redo</span>
                </button>
                <button type="button" className="mind-btn" title={t("添加概要") + " (Ctrl+G)"}
                        onClick={() => addGeneralization()}>
                    <span className="material-icons">call_merge</span>
                </button>
                <span className="mind-toolbar__sep"/>
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
                        onClick={() => {
                            mindRef.current?.view?.fit?.();
                            setScale(readScale(mindRef.current));
                        }}>
                    <span className="material-icons">fit_screen</span>
                </button>
            </div>
            {/* 布局 / 连线 / 主题：与官方 demo 的「结构」「样式」面板对齐 */}
            <div className="mind-toolbar mind-toolbar--sub">
                <select className="mind-select" title={t("结构")}
                        value={layout}
                        onChange={(e) => {
                            const v = e.target.value;
                            mindRef.current?.setLayout?.(v);
                            setLayout(v);
                            markDirty();
                        }}>
                    {MIND_LAYOUTS.map(it => <option key={it.value} value={it.value}>{t(it.label)}</option>)}
                </select>
                <select className="mind-select" title={t("连线风格")}
                        defaultValue=""
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v) {
                                // setThemeConfig 是整体替换，必须和现有配置合并，
                                // 否则会把已经设置的其它自定义样式冲掉
                                const cur = mindRef.current?.getCustomThemeConfig?.() || {};
                                mindRef.current?.setThemeConfig?.({...cur, lineStyle: v});
                                markDirty();
                            }
                            e.target.value = "";
                        }}>
                    <option value="">{t("连线风格")}</option>
                    {MIND_LINE_STYLES.map(it => <option key={it.value} value={it.value}>{t(it.label)}</option>)}
                </select>
                <select className="mind-select" title={t("主题")}
                        value={themeName}
                        onChange={(e) => {
                            const v = e.target.value;
                            setThemeName(v);
                            mindRef.current?.setTheme?.(v);
                            markDirty();
                        }}>
                    {MIND_THEMES.map(it => <option key={it.value} value={it.value}>{t(it.label)}</option>)}
                </select>
                <span className="mind-toolbar__gap"/>
            </div>
            <div className="mind-canvas" ref={wrapRef}>
                {/* simple-mind-map 的渲染容器 */}
                <div className="mind-mount" ref={containerRef}></div>
                {loading && <div className="mind-mask">Loading...</div>}
                {error && <div className="mind-mask">{error}</div>}
                {menu && (
                    <OverlayTransparent click={() => setMenu(null)}>
                        <FileMenuItem x={menu.x} y={menu.y} items={menu_items(NODE_MENU)}
                                      click={(cmd: string) => run_menu(cmd)}/>
                    </OverlayTransparent>
                )}
            </div>
        </div>
    );
}

/** 从视图实例读取当前缩放百分比（库没有 getScale 方法，要通过变换数据取） */
function readScale(mm: any): number {
    const s = mm?.view?.getTransformData?.()?.state?.scale;
    return typeof s === "number" && s > 0 ? Math.round(s * 100) : 100;
}
