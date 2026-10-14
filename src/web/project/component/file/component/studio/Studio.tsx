import React, {useCallback, useEffect, useRef, useState} from "react";
import {$stroe} from "../../../../util/store";
import { useAtom } from 'jotai'; 
import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {FolderTree} from "./Tree/FolderTree";
import {fileHttp} from "../../../../util/config";
import {get_last_name, getRouterAfter, getRouterPrePath} from "../../../../util/WebPath";
import {RCode} from "../../../../../../common/Result.pojo";
import {FileTree, FileTypeEnum} from "../../../../../../common/file.pojo";
import {editor_data, use_auth_check} from "../../../../util/store.util";
// import {getEditModelType} from "../../../../../../common/StringUtil";
import {NotyFail, NotySuccess, NotyWaring} from "../../../../util/noty";
import {saveTxtReq} from "../../../../../../common/req/file.req";
import * as lodash from "lodash";
import {ableExtBeautify, FileMenuData, getFileFormat} from "../../../../../../common/FileMenuType";
import {PromptEnum} from "../../../prompts/Prompt";
import {useTranslation} from "react-i18next";
import { MAX_SIZE_TXT } from "../../../../../../common/ValueUtil";
import {useLocation, useNavigate} from "react-router-dom";
import {UserAuth} from "../../../../../../common/req/user.req";
// import Ace from "../Ace";


const Ace = React.lazy(() => import("../Ace"));
const MdEditor = React.lazy(() => import("../md_editor/MdEditor"));
const MdOutline = React.lazy(() => import("../md_editor/MdOutline"));
import type {MdEditorPaneApi, MdEditorPaneProps} from "../md_editor/MdEditor";
import type {OutlineItem} from "../md_editor/MdOutline";
// 通用聊天面板：这里以「内嵌模式」放到右侧，Header 由面板自己渲染
const ChatPanel = React.lazy(() => import("../../../aichat/page/ChatPanel"));
// 内嵌画板编辑器（.draw / .excalidraw）
const ExcalidrawInline = React.lazy(() => import("../ExcalidrawInline"));
// 内嵌思维导图编辑器（.mind）
const MindMapInline = React.lazy(() => import("../MindMapInline"));

/** 是否用 md 编辑器（所见即所得）打开：只认 .md 后缀，其余一律走 Ace 文本编辑 */
function is_markdown_file(name: string): boolean {
    return getFileFormat(name) === FileTypeEnum.md;
}

/** 是否用画板编辑器打开：.draw / .excalidraw（getFileFormat 已把 .draw 归一为 excalidraw） */
function is_draw_file(name: string): boolean {
    return getFileFormat(name) === FileTypeEnum.excalidraw;
}

/** 是否是思维导图文件：.mind 后缀 */
function is_mind_file(name: string): boolean {
    return getFileFormat(name) === FileTypeEnum.mind;
}

/** 左侧面板显示的内容 */
type NavContent = "folder" | "outline";


export default function Studio(props) {
    // const [studio, set_studio] = useAtom($stroe.studio);
    const [list, set_list] = useState([]);
    const [pre_path, set_pre_path] = useState("")
    const [editorValue, setEditorValue] = useState("");
    const [update, set_update] = useState<boolean>(false);
    // const [edit_model, set_edit_model] = useState("text");
    const [edit_filename, set_edit_filename] = useState({path: "", name: ""});
    const [edit_file_path, set_edit_file_path] = useState("");
    const [confirm, set_confirm] = useAtom($stroe.confirm);
    const [have_update, set_have_update] = useState(false);
    const [shellShow, setShellShow] = useAtom($stroe.fileShellShow);
    const [file_shell_hidden, set_file_shell_hidden] = useAtom($stroe.file_shell_hidden);
    const studioDividerRef = useRef(null);
    const studio_nav_ref = useRef(null);
    const [drag, setShellDrag] = useState(false);
    const [nav_width, set_nav_width] = useState(16);
    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const {t} = useTranslation();
    const navigate = useNavigate();

    // 当前文件是否用 md 编辑器打开
    const is_md = is_markdown_file(edit_filename.name);
    // 当前文件是否用画板编辑器打开（.draw / .excalidraw）
    const is_draw = is_draw_file(edit_filename.name);
    // 当前文件是否是思维导图（.mind）
    const is_mind = is_mind_file(edit_filename.name);
    // md 编辑器交给外层的编辑能力（保存、模式切换、导出、大纲跳转）
    const md_api = useRef<MdEditorPaneApi | null>(null);
    // 画板编辑器句柄（保存按钮）
    const excalidraw_api = useRef<any>(null);
    // 思维导图编辑器句柄（保存按钮）
    const mind_api = useRef<any>(null);
    // md 编辑器上报的大纲数据与当前高亮项
    const [outline_items, set_outline_items] = useState<OutlineItem[]>([]);
    const [outline_active, set_outline_active] = useState(-1);
    // 左侧面板内容：目录 / 大纲（大纲只对 md 文件可用）
    const [nav_content, set_nav_content] = useState<NavContent>("folder");
    // 左侧面板开关。切到非 md 文件时自动回到目录视图
    const [show_nav, set_show_nav] = useState(true);
    // md 编辑器的脏标记（由它上报，用于 Header 显示保存按钮）
    const [md_dirty, set_md_dirty] = useState(false);

    // ===== 右侧 AI 聊天面板 =====
    // 是否展开右侧聊天面板；聊天面板绑定「当前 Studio 工作目录」，
    // 打开时按工作目录定位会话（找不到就新建），并记住会话 id 到 sessionStorage。
    const [chat_open, set_chat_open] = useState(false);
    // 右侧面板宽度（em）；默认占右侧可用空间约 40%，最小 320px，最大 70%
    const [chat_width, set_chat_width] = useState(33);
    const chatDividerRef = useRef(null);
    const [chat_drag, set_chat_drag] = useState(false);
    /** 已定位好的会话 id（由 ChatPanel 定位后回调写入，用于 sessionStorage 记录） */
    const [chat_session_id, set_chat_session_id] = useState<string | undefined>(undefined);
    /** 工作目录对应的 sessionStorage key：每个目录各自记住自己的会话 */
    const chat_storage_key = "studio_chat_session";
    /** 读取该工作目录上次的会话 id（仅作为初始提示，仍以工作目录匹配结果为准） */
    const read_chat_session = (cwd: string): string | undefined => {
        try {
            const raw = sessionStorage.getItem(chat_storage_key);
            if (!raw) return undefined;
            const map = JSON.parse(raw);
            return map?.[cwd] || undefined;
        } catch {
            return undefined;
        }
    };

    /** 记录该工作目录当前会话 id */
    const write_chat_session = (cwd: string, sessionId: string) => {
        try {
            const raw = sessionStorage.getItem(chat_storage_key);
            const map = raw ? JSON.parse(raw) : {};
            map[cwd] = sessionId;
            sessionStorage.setItem(chat_storage_key, JSON.stringify(map));
        } catch {
            // sessionStorage 不可用（隐私模式等）时静默忽略，不影响功能
        }
    };


    const location = useLocation();
    let folder_path = location.pathname.split("/").filter(Boolean).pop();
    folder_path = decodeURIComponent(folder_path);

    /** 权限校验：AI 聊天页与右侧面板使用同一权限 */
    const {check_user_auth} = use_auth_check();

    /** Studio 当前工作目录：URL 上的目录路径（已解码），供右侧 AI 聊天面板按目录定位会话 */
    const chat_cwd = getRouterAfter('file', folder_path);

    function shellClick() {
        if (file_shell_hidden === true || file_shell_hidden === false) {
            set_file_shell_hidden(!file_shell_hidden);
            return;
        }
        if (!shellShow.show) {
            setShellShow({
                show: true,
                path: getRouterAfter('file', folder_path)
            })
            set_file_shell_hidden(false);
        } else {
            setShellShow({
                show: false,
                path: ''
            })
        }
    }

    const get_item = async () => {
        const p = getRouterAfter('file', folder_path);
        set_pre_path(p);
        set_edit_filename({path: p, name: get_last_name(p)});
        const rsp = await fileHttp.post('studio/get/item', {path: p});
        if (rsp.code === RCode.Success) {
            const folder_list = [];
            const file_list = [];
            for (const item of rsp.data.list) {
                if(item.type === "folder") {
                    folder_list.push(item);
                } else if (item.type === "file") {
                    file_list.push(item);
                }
            }
            set_list([...folder_list,...file_list]);
        }
    }
    useEffect(() => {
        setEditorValue("");
        // @ts-ignore
        // set_edit_filename({});
        set_have_update(false);
        // if (!studio.folder_path) {
        //     return;
        // }
        get_item();
    }, []);

    const cancel = () => {
        // set_studio({});
        setShellShow({
            show: false,
            path: ''
        })
        set_file_shell_hidden(undefined);
        navigate(-1);
    }
    const load_file = async (name, pre_path) => {
        // const model = getEditModelType(name) ?? "text";
        // set_edit_model(model);
        const rsq = await fileHttp.get(`${encodeURIComponent(pre_path)}`)
        setEditorValue(rsq.data);
        editor_data.set_value_temp(rsq.data);
        set_edit_filename({path: pre_path, name});
        set_edit_file_path(pre_path);
        // 换成别的文件时左侧面板回到目录视图：大纲是上一个 md 文件的，留着会对不上
        set_nav_content("folder");
        set_md_dirty(false);
    }


    const open_file = (pojo: FileTree,pre_path)=>{
        if(pojo.size > MAX_SIZE_TXT) {
            set_confirm({
                open: true, handle: () => {
                    load_file(pojo.name, pre_path);
                    set_confirm({open: false, handle: null});
                    set_have_update(false);
                }, title: "超过20MB了还要打开吗?"
            });
        } else {
             load_file(pojo.name, pre_path);
        }
    }
    const click = async (pojo: FileTree, set_children: (list: FileTree[]) => void, pre_path: string) => {
        if (pojo.type === "folder") {
            const rsp = await fileHttp.post('studio/get/item', {path: `${pre_path}`});
            if (rsp.code === RCode.Success) {
                const folder_list = [];
                const file_list = [];
                for (const item of rsp.data.list) {
                    if(item.type === "folder") {
                        folder_list.push(item);
                    } else if (item.type === "file") {
                        file_list.push(item);
                    }
                }
                set_children([...folder_list,...file_list]);
                // set_children(rsp.data.list);
            }
        } else {
            // 点击文件
            if (have_update) {
                set_confirm({
                    open: true, handle: () => {
                        set_confirm({open: false, handle: null});
                        set_have_update(false);
                        open_file(pojo,pre_path);
                    }, title: "确定不保存就切换吗?"
                });
                return;
            }
            open_file(pojo,pre_path);
        }
    }

    async function file_save() {
        if (!have_update) {
            return;
        }
        const data: saveTxtReq = {
            context: editor_data.get_editor_value()
        }
        const rsq = await fileHttp.post(`save/${encodeURIComponent(edit_file_path)}`, data)
        if (rsq.code === 0) {
            // NotySucess("保存成功");
            set_have_update(false);
        }
    }

    const handleKeyDown = (event) => {
        if (event.ctrlKey && event.key === 's') {
            event.preventDefault();
            if (have_update) {
                file_save();
            }
        }
    };
    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [have_update]);
    let change = () => {
        // editor_data.set_value_temp(value);
        if (!have_update) {
            set_have_update(true);
        }
    }
    const handleDrag = useCallback(lodash.throttle((event) => {

        const size = parseFloat(getComputedStyle(studio_nav_ref.current).fontSize);
        const left = window.innerWidth / size - 4;
        const userPos = event.clientX / size;
        // @ts-ignore
        const right = 2.25 + studioDividerRef.current.offsetWidth / size;
        if (userPos <= left && userPos >= right) {
            set_nav_width(parseFloat(userPos.toFixed(2)))
        }
    }, 32), [])
    const handlePointerDown = () => {
        // 按下
        setShellDrag(true)
        studio_nav_ref.current.addEventListener("pointermove", handleDrag);
    };
    const handlePointerup = () => {
        // 抬起
        setShellDrag(false)
        studio_nav_ref.current.removeEventListener("pointermove", handleDrag);

    };

    // ===== 右侧聊天面板拖拽（与左侧相反方向：往左拖变宽） =====
    const handleChatDrag = useCallback(lodash.throttle((event: PointerEvent) => {
        const el = chatDividerRef.current as HTMLElement;
        if (!el) return;
        const size = parseFloat(getComputedStyle(el).fontSize);
        // 面板宽度 = 容器右边界到鼠标的距离
        const right = el.parentElement.getBoundingClientRect().right;
        const width_px = right - event.clientX;
        // 约束：最小 320px，最大不超过容器的 70%
        const min_px = 320;
        const max_px = el.parentElement.getBoundingClientRect().width * 0.7;
        const clamped = Math.min(Math.max(width_px, min_px), max_px);
        set_chat_width(parseFloat((clamped / size).toFixed(2)));
    }, 32), []);

    const handleChatPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        set_chat_drag(true);
        // 用 document 监听：拖动时鼠标可能移出分隔线窄条
        document.addEventListener("pointermove", handleChatDrag);
        document.addEventListener("pointerup", handleChatPointerUp, { once: true });
    };

    const handleChatPointerUp = () => {
        set_chat_drag(false);
        document.removeEventListener("pointermove", handleChatDrag);
    };


    const items_folder = [{r: t("创建文件"), v: "创建文件"},{r: t("创建目录"), v: "创建目录"},{r: t("重命名"), v: "重命名"},{r: t("删除"), v: "删除"}];
    const items_file = [{r: t("重命名"), v: "重命名"}, {r: t("删除"), v: "删除"}];

    const handleContextMenu = (event, name, path, isDir, toggleExpansion) => {
        event.preventDefault();
        const pojo = new FileMenuData();
        pojo.path = path;
        pojo.filename = name;
        pojo.x = event.clientX;
        pojo.y = event.clientY;
        pojo.items = isDir ? items_folder : items_file;
        if (toggleExpansion === get_item) {
            pojo.items = pojo.items.slice(0,2);
        }
        pojo.type = isDir ? FileTypeEnum.studio_folder : FileTypeEnum.studio_file;
        const call = (v?:boolean) => {
            toggleExpansion(v);
        }
        pojo.textClick = (v) => {
            switch (v) {
                case "创建文件":
                    setShowPrompt({show: true, type: PromptEnum.FileNew, overlay: true, data: {dir: path, call}});
                    break;
                case "创建目录":
                    setShowPrompt({show: true,type:PromptEnum.DirNew,overlay: true,data:{dir: path, call}});
                    break;
                case "删除":
                    if (have_update && (edit_filename.path === path || edit_filename.path.includes(path)) ) {
                        const extra_call = ()=>{
                            call(isDir);
                            set_have_update(false);
                            set_edit_filename({});
                            setEditorValue("");
                            editor_data.set_value_temp("");
                        }
                        setShowPrompt({show: true, type: PromptEnum.FilesDelete, overlay: true, data: {path: path, call:extra_call,filename:name}});
                        break;
                    }
                    setShowPrompt({show: true, type: PromptEnum.FilesDelete, overlay: true, data: {path: path,filename:name, call:isDir?()=>{call(true)}:call}});
                    break;
                case "重命名":
                    setShowPrompt({show: true,type:PromptEnum.FileRename,overlay: true,data:{path:path,dir:getRouterPrePath(path),call:()=>{call(true)},filename:name}});
                    break;
                default:
                    break;
            }
        }
        setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
    };

    function formatCode (){
        editor_data.get_editor()?.['formatCode']()
    }

    /** 左侧面板是否显示大纲（仅 md 文件、且切到大纲视图时）。
     *  不再依赖 show_nav：面板收起时只是被隐藏（display:none），
     *  组件仍保持挂载，避免收起/展开时 FolderTree 与 MdOutline 相互替换导致树状态丢失。 */
    const outline_on = is_md && nav_content === "outline";

    return <div className={"studio studio--file"}>
        <Header ignore_tags={true}
                left_children={[
                    <ActionButton key={1} title={"取消"} icon={"close"} onClick={cancel}/>,
                    <div key={2}>{edit_filename.name}</div>
                ]}>
            <title>{edit_filename.name}</title>
            {/* 左侧面板开关：任何编辑器下都能收起/展开，md 文件时里面是大纲+目录 */}
            <ActionButton title={"侧边栏"} icon={"list"} onClick={() => set_show_nav(v => !v)}
                          selected={show_nav}/>
            {/* md 文件专属能力：与全屏 md 编辑器的 Header 保持一致 */}
            {is_md && [
                md_dirty ? <ActionButton key={"save"} title={t("保存")} icon={"save"}
                                         onClick={() => md_api.current?.save()}/> : null,
                <ActionButton key={"mode"} icon={md_api.current?.mode() === "source" ? "edit" : "code"}
                              title={md_api.current?.mode() === "source" ? t("实时编辑模式") : t("源码模式")}
                              onClick={() => md_api.current?.toggle_mode()}/>,
                <ActionButton key={"pdf"} title={t("导出PDF")} icon={"print"}
                              onClick={() => md_api.current?.export_pdf()}/>,
            ]}
            { !is_md && ableExtBeautify(edit_filename.name) && <ActionButton title={"格式化"} icon={"data_object"} onClick={formatCode}/> }
            <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick}/>
            {/* 右侧 AI 聊天面板开关：打开后按「当前工作目录」定位该目录的 AI 会话。
                需与 AI 聊天页同一权限（UserAuth.ai_agent_page），无权限则不显示该按钮 */}
            {check_user_auth(UserAuth.ai_agent_page) && (
                <ActionButton title={t("AI 聊天")} icon={"smart_toy"} selected={chat_open}
                              onClick={() => set_chat_open(v => !v)}/>
            )}
            {/* 保存按钮：md 走 md 编辑器自己的保存；画板/思维导图走各自句柄的 save；
                其余文本文件走 Studio 自己的 file_save */}
            {is_md
                ? (md_dirty ? <ActionButton title={t("保存")} icon={"save"} onClick={() => md_api.current?.save()}/> : null)
                : is_draw
                    ? <ActionButton title={t("保存")} icon={"save"} onClick={() => excalidraw_api.current?.save()}/>
                    : is_mind
                        ? <ActionButton title={t("保存")} icon={"save"} onClick={() => mind_api.current?.save()}/>
                        : (have_update ? <ActionButton title={"保存"} icon={"save"} onClick={file_save}/> : null)
            }
        </Header>
        <div className={"studio-body"} ref={studio_nav_ref}>
            {/* 左侧面板：用 display 控制显隐，而不是条件渲染。
                条件渲染会在收起时把 FolderTree 整棵树卸载，树节点展开状态（Folder 的局部 state）随之丢失，
                再次展开时所有已打开的目录都会被折叠回去。这里始终挂载、仅隐藏，从而保留展开/加载状态。 */}
            <div className={"studio-nav"}
                 style={{display: show_nav ? undefined : "none", width: `${nav_width - 1}em`}}
                 onContextMenu={(event) => {
                     handleContextMenu(event, edit_filename.name, getRouterAfter('file', folder_path), true, get_item)
                 }}
            >
                {/* 大纲 / 目录：两个都保持挂载，用 display 切换显隐。
                    若用条件渲染，切到大纲会把 FolderTree 卸载，树的展开/已加载状态全部丢失，
                    再切回目录时所有打开的目录都会折叠回去。 */}
                <div className={"studio-nav-outline"} style={{display: outline_on ? undefined : "none"}}>
                    <MdOutline items={outline_items} active_pos={outline_active}
                               on_click={(item) => md_api.current?.goto_heading(item)}/>
                </div>
                <div className={"studio-nav-folder"} style={{display: outline_on ? "none" : undefined}}>
                    <FolderTree pre_path={pre_path} list={list} click={click} active_path={edit_file_path}
                                handleContextMenu={handleContextMenu} fatherNowToggleExpansion={get_item}/>
                </div>
                {/* 底部切换：md 文件可以在大纲与目录之间切，其他文件没有大纲，不显示 */}
                {is_md && (
                    <div className={"studio-nav-switch"}>
                        <ActionButton
                            icon={outline_on ? "folder" : "list"}
                            title={outline_on ? t("文件目录") : t("大纲")}
                            onClick={() => set_nav_content(outline_on ? "folder" : "outline")}/>
                    </div>
                )}
            </div>
            {show_nav && <div className={"studio__divider"} ref={studioDividerRef} onPointerDown={handlePointerDown}
                 onPointerUp={handlePointerup}/>}
            {drag &&
                <div
                    className="shell__overlay" onPointerUp={handlePointerup}
                />
            }
            {/* md 文件走 md 编辑器（含工具栏、右键菜单、大纲、主题、源码模式），
                .draw/.excalidraw 走内嵌画板，.mind 走思维导图，
                其他文件走 Ace 文本编辑器。
                md 编辑器嵌进来自带 md-editor-context 外壳，因此这里不再包 studio-editor 的内边距。 */}
            {is_md
                ? <div className={"studio-editor studio-editor--md"} key={edit_file_path}>
                    <React.Suspense fallback={null}>
                        <MdEditor pane={{
                            path: edit_file_path,
                            url: fileHttp.getDownloadUrl(encodeURIComponent(edit_file_path)),
                            name: edit_filename.name,
                            on_dirty: set_md_dirty,
                            on_outline: (items, active) => {
                                set_outline_items(items);
                                set_outline_active(active);
                            },
                            register: (api) => {
                                md_api.current = api;
                            },
                        }}/>
                    </React.Suspense>
                </div>
                : is_draw
                ? <div className={"studio-editor studio-editor--draw"} key={edit_file_path}>
                    <React.Suspense fallback={null}>
                        <ExcalidrawInline
                            reset_key={edit_file_path}
                            url={fileHttp.getDownloadUrl(encodeURIComponent(edit_file_path))}
                            save_path={edit_file_path}
                            on_dirty={set_have_update}
                            on_saved={() => set_have_update(false)}
                            register={(handle) => {
                                excalidraw_api.current = handle;
                            }}
                        />
                    </React.Suspense>
                </div>
                : is_mind
                ? <div className={"studio-editor studio-editor--mind"} key={edit_file_path}>
                    <React.Suspense fallback={null}>
                        <MindMapInline
                            reset_key={edit_file_path}
                            url={fileHttp.getDownloadUrl(encodeURIComponent(edit_file_path))}
                            on_dirty={set_have_update}
                            on_saved={() => set_have_update(false)}
                            register={(handle) => {
                                mind_api.current = handle;
                            }}
                            on_save={async (context: string) => {
                                const rsq = await fileHttp.post(
                                    `save/${encodeURIComponent(edit_file_path)}`,
                                    {context},
                                );
                                return rsq.code === RCode.Success;
                            }}
                        />
                    </React.Suspense>
                </div>
                : <div className={"studio-editor"} key={edit_file_path}>
                    {edit_filename.name && <React.Suspense fallback={null}>
                        <Ace name={edit_filename.name} on_change={change}/>
                    </React.Suspense>}
                </div>}

            {/* 右侧 AI 聊天面板：与 Studio 内容并排，Header 由面板自己渲染（内嵌模式）。
                工作目录 = Studio URL 上的目录路径（folder_path）；
                面板据此定位会话并把结果回传记录。 */}
            {chat_open && (
                <React.Fragment>
                    <div className={"studio__divider studio__divider--chat"} ref={chatDividerRef}
                         onPointerDown={handleChatPointerDown}/>
                    <div className={"studio-chat-panel"} style={{width: `${chat_width}em`}}>
                        <React.Suspense fallback={null}>
                            <ChatPanel
                                inline_header={true}
                                sync_url={false}
                                file_cwd_path={chat_cwd}
                                session_id={chat_session_id ?? read_chat_session(chat_cwd)}
                                on_session_change={(id) => {
                                    set_chat_session_id(id);
                                    write_chat_session(chat_cwd, id);
                                }}
                            />
                        </React.Suspense>
                    </div>
                </React.Fragment>
            )}
        </div>
    </div>
}
