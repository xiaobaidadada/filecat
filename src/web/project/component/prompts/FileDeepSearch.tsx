import React, {useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAtom} from "jotai";
import {useTranslation} from "react-i18next";
import {$stroe} from "../../util/store";
import {file_deep_search_item, file_deep_search_req, file_deep_search_type} from "../../../../common/req/file.req";
import {routerConfig} from "../../../../common/RouterConfig";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {WsClient} from "../../../../common/frame/ws.client";
import {get_ws_base} from "../../util/ws";
import {InputCheckbox, InputTextIcon} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";
import {SearchExcludePanel} from "./SearchExcludePanel";
import {SearchIgnoreSetting} from "./SearchIgnoreSetting";
import {user_click_file} from "../file/FileUtil";

// 最多往 DOM 里渲染的结果条数。搜索结果可能几万条（例如关键词只输一个字母），
// 全量渲染会直接卡死页面，所以只渲染前这么多条，其余提示用户细化关键词。
const MAX_RENDER = 500;

/**
 * 全局递归搜索弹窗。
 * 走 WS 流式推送：后端边遍历边下发命中结果，这里收到一批就追加一批，
 * 搜索过程中可以随时取消；关闭弹窗 / 跳转 / WS 断开也会自动取消。
 */
export function FileDeepSearch(props: { base_path: string }) {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const [, set_prompt_card] = useAtom($stroe.prompt_card);
    const [user_base_info] = useAtom($stroe.user_base_info);
    const {click_file} = user_click_file();
    const [keyword, setKeyword] = useState("");
    // 搜索方式：按文件名匹配，或按文件内容匹配
    const [search_type, set_search_type] = useState<file_deep_search_type>("name");
    // 正则、忽略大小写默认都不勾；显示匹配行只影响内容搜索，默认开启
    const [is_regex, set_is_regex] = useState(false);
    const [ignore_case, set_ignore_case] = useState(false);
    const [show_match_line, set_show_match_line] = useState(true);
    // 排除规则：具体路径来自弹窗内勾选，忽略名字来自用户持久化配置
    const [exclude_paths, set_exclude_paths] = useState<string[]>([]);
    const [ignore_names, set_ignore_names] = useState<string[]>([]);
    // 排除面板是否展开
    const [show_exclude, set_show_exclude] = useState(false);
    // 是否处于「忽略名字设置」视图
    const [setting_open, set_setting_open] = useState(false);
    const [searching, setSearching] = useState(false);
    const [list, setList] = useState<file_deep_search_item[]>([]);
    // 本次搜索命中的总条数。list 只保留能渲染的部分，总数要单独记，用于判断结果是否超出
    const [total, setTotal] = useState(0);
    // 是否已经搜过一次（用于区分「还没搜」和「搜了但没结果」）
    const [searched, setSearched] = useState(false);
    // searched 的 ref 副本：effect 的清理函数是首次渲染时的闭包，
    // 直接读 useState 拿到的永远是初始值 false
    const searched_ref = useRef(false);
    // WS 连接由这个弹窗独占，关闭时一并断开
    const ws = useMemo(() => new WsClient(get_ws_base(), "file_deep_search"), []);
    // 必须在 setClose 之前就先断开，避免 React 卸载后又触发一次状态更新
    const closed = useRef(false);
    // 用户主动取消当前这次搜索。后端可能还有数据在路上，靠它把后续的包丢掉；
    // 重新发起搜索时要复位，否则新搜索的结果会被一起丢弃
    const cancelled = useRef(false);
    // 路由里的路径是 URL 编码的，展示给用户时要解码，否则中文目录会显示成 %E6%B5%8B
    const show_path = decodeURIComponent(props.base_path);

    const close = () => set_prompt_card({open: false});

    // 从当前用户数据里取已保存的忽略名字
    const load_saved_names = (): string[] => {
        const saved = user_base_info?.user_data?.search_exclude_names;
        return Array.isArray(saved) ? saved : [];
    };

    // 载入用户上次保存的忽略名字
    useEffect(() => {
        set_ignore_names(load_saved_names());
    }, [user_base_info?.user_data?.search_exclude_names]);

    useEffect(() => {
        // 攒一批再渲染，避免命中很多时每来一条都触发一次 React 更新
        let buffer: file_deep_search_item[] = [];
        let flush_timer: any = null;
        const flush = () => {
            flush_timer = null;
            // 取消后既不再接收，也不再把已经积压在 buffer 里的数据渲染出来
            if (closed.current || cancelled.current || !buffer.length) return;
            const batch = buffer;
            buffer = [];
            setTotal(prev => prev + batch.length);
            // 只把前面的结果放进列表，超出部分不再渲染（总数仍然累计，用于提示）
            setList(prev => prev.length >= MAX_RENDER ? prev : [...prev, ...batch].slice(0, MAX_RENDER));
        };
        const on_data = (data: WsData<file_deep_search_item[]>) => {
            // 用户点了取消，后端可能还有几批数据在路上，直接丢掉
            if (closed.current || cancelled.current) return;
            buffer.push(...(data.context ?? []));
            if (flush_timer === null) flush_timer = setTimeout(flush, 100);
        };
        const on_end = () => {
            if (closed.current || cancelled.current) return;
            flush();
            setSearching(false);
        };
        const on_close = () => {
            // WS 断开（网络异常/服务重启）时结束搜索，避免一直转圈
            if (closed.current) return;
            setSearching(false);
        };
        ws.addMsg(CmdType.file_deep_search_data, on_data);
        ws.addMsg(CmdType.file_deep_search_end, on_end);
        ws.on_message("close", on_close);
        return () => {
            // 卸载即取消：backend 会 abort 掉遍历。
            // cancel 是单向通知（后端不回包），必须用 sendNotify：
            // 走 sendData 会等一个永远不来的回包，白等 6 秒超时。
            closed.current = true;
            clearTimeout(flush_timer);
            // 只有真正发起过搜索才需要通知后端取消，否则会为了一条 cancel 白建一条连接
            if (searched_ref.current) {
                // sendNotify 内部要等连接就绪，必须先发完再关，否则 close 掉连接后消息发不出去
                ws.sendNotify(CmdType.file_deep_search_cancel, {}).catch(() => {
                }).finally(() => ws.close());
            }
            // 退订所有消息，避免 ws 对象被丢弃后 handler 还挂在 emitter 上
            ws.removeMsg(CmdType.file_deep_search_data);
            ws.removeMsg(CmdType.file_deep_search_end);
            ws.off_message("close", on_close);
        };
    }, []);

    const search = () => {
        const k = keyword.trim();
        if (!k || searching) {
            return;
        }
        // 这次搜索重新开始接收数据（上一次可能被取消过）
        cancelled.current = false;
        setList([]);
        setTotal(0);
        setSearched(true);
        searched_ref.current = true;
        setSearching(true);
        const req: file_deep_search_req = {
            param_path: props.base_path,
            keyword: k,
            search_type,
            // 正则和忽略大小写两种搜索方式都支持
            is_regex,
            ignore_case,
        };
        if (search_type === "content") {
            req.show_match_line = show_match_line;
        }
        // 排除规则两种搜索都生效
        if (exclude_paths.length) {
            req.exclude_paths = exclude_paths;
        }
        if (ignore_names.length) {
            req.exclude_names = ignore_names;
        }
        // 后端 handler 立即回包（搜索在后台跑），所以这里正常能收到；加 catch 只是兜底网络异常
        ws.sendData(CmdType.file_deep_search, req).catch(() => {
        });
    };

    const cancel = () => {
        cancelled.current = true;
        // cancel 是单向通知，后端不回包，用 sendNotify 直接发出去即可
        ws.sendNotify(CmdType.file_deep_search_cancel, {}).catch(() => {
        });
        setSearching(false);
    };

    // 跳转。后端返回的 path 是相对系统根目录的完整 web 路径（以 / 开头），
    const jump = (item: file_deep_search_item) => {
        let target = item.is_dir ? item.path : item.path.slice(0, item.path.lastIndexOf("/") + 1);
        // 文件路由的目录形式以斜杠结尾
        if (!target.endsWith("/")) {
            target += "/";
        }
        close();
        // 逐段编码，避免中文目录在路由里变成乱码（整串 encodeURIComponent 会把分隔的 / 也编码掉）。
        // routerConfig.file 自带前导斜杠，target 也以 / 开头，直接拼接即可，不要额外补斜杠。
        navigate(routerConfig.file + target.split("/").map(encodeURIComponent).join("/"));
    };

    // 点结果行的「打开」按钮：目录直接进入，文件交给统一的 click_file 打开
    // （由它按文件类型分派到文本/图片/md/表格等编辑器，和文件列表里双击完全一致）。
    const open_item = async (item: file_deep_search_item) => {
        if (item.is_dir) {
            return jump(item);
        }
        // click_file 用「当前页面路径 + 文件名」拼地址，命中文件不在当前目录时会拼错。
        // 这里先跳到文件所在目录再打开，交给 click_file 走和文件列表完全一致的默认逻辑。
        const dir = item.path.slice(0, item.path.lastIndexOf("/") + 1) || "/";
        close();
        navigate(routerConfig.file + dir.split("/").map(encodeURIComponent).join("/"));
        // 等目录切换生效后再打开，否则 click_file 仍按旧路由拼路径
        await new Promise(r => setTimeout(r, 300));
        await click_file({name: item.name, opt_shell: true});
    };

    const is_content = search_type === "content";

    // 忽略名字设置页在弹窗内部切换视图，而不是换掉整个弹窗。
    // 这样搜索结果、关键词、排除项都保留着，返回后可以直接继续操作。
    if (setting_open) {
        return <SearchIgnoreSetting on_back={() => {
            set_setting_open(false);
            // 设置页可能改了忽略名字，重新载入一遍再继续用
            set_ignore_names(load_saved_names());
        }}/>;
    }

    return <div className="file-deep-search">
        <div className="file-deep-search__bar">
            <InputTextIcon icon={"search"}
                           value={keyword}
                           placeholder={is_content ? t("搜文件内容") : t("搜文件名")}
                           handleInputChange={(v) => setKeyword(v)}
                           handleEnterPress={search}/>
            <button className="button button--flat" onClick={searching ? cancel : search}>
                {searching ? t("取消") : t("搜索")}
            </button>
            <ActionButton icon={"close"} title={t("关闭")} onClick={close}/>
        </div>
        {/* 搜索方式切换：文件名匹配走 fast-glob，内容匹配走 ripgrep */}
        <div className="file-deep-search__tabs">
            <button className={"file-deep-search__tab" + (is_content ? "" : " file-deep-search__tab--active")}
                    onClick={() => set_search_type("name")}>{t("文件名")}</button>
            <button className={"file-deep-search__tab" + (is_content ? " file-deep-search__tab--active" : "")}
                    onClick={() => set_search_type("content")}>{t("文件内容")}</button>
        </div>
        {/* 文件名和内容搜索都支持正则、忽略大小写；显示匹配行只对内容搜索有意义 */}
        <div className="file-deep-search__options">
            <InputCheckbox context={t("正则")} selected={is_regex} onchange={() => set_is_regex(!is_regex)}/>
            <InputCheckbox context={t("忽略大小写")} selected={ignore_case}
                           onchange={() => set_ignore_case(!ignore_case)}/>
            {is_content && <InputCheckbox context={t("显示匹配行")} selected={show_match_line}
                                          onchange={() => set_show_match_line(!show_match_line)}/>}
        </div>
        <div className="file-deep-search__hint">
            <span>{t("范围")}：{show_path}</span>
            <span className="file-deep-search__hint-right">
                {(exclude_paths.length > 0 || ignore_names.length > 0) && <span className="file-deep-search__excluded">
                    {t("已排除")} {exclude_paths.length + ignore_names.length}
                </span>}
                <button className={"file-deep-search__filter" + (show_exclude ? " file-deep-search__filter--active" : "")}
                        onClick={() => set_show_exclude(!show_exclude)}>
                    <span className="material-symbols-outlined">filter_alt</span>
                    {t("过滤")}
                </button>
                {total > 0 && <span className="file-deep-search__count">
                    {total > MAX_RENDER ? `${t("已显示")} ${MAX_RENDER} / ${total}` : `${total}`}
                </span>}
            </span>
        </div>
        {show_exclude && <SearchExcludePanel base_path={props.base_path}
                                            exclude_paths={exclude_paths}
                                            ignore_names={ignore_names}
                                            on_change_paths={set_exclude_paths}
                                            on_change_names={set_ignore_names}
                                            on_open_setting={() => set_setting_open(true)}/>}
        <div className={"file-deep-search__body" + (is_content && show_match_line ? " file-deep-search__body--line" : "")}>
            {list.length > 0 && <div className="file-deep-search__results">
                {list.map((item) => {
                    const dir = item.path.slice(0, item.path.lastIndexOf("/") + 1);
                    return <div className="file-deep-search__row" key={item.path}>
                        <div className="file-deep-search__name">
                            {item.is_dir
                                ? <span className="file-deep-search__dir">{item.name}</span>
                                : <span className="file-deep-search__file" title={item.name}>{item.name}</span>}
                            <span className="file-deep-search__path">{dir}</span>
                            {/* 内容搜索时把命中的行跟在文件名下面，点行号打开文件 */}
                            {item.lines && item.lines.length > 0 && <div className="file-deep-search__lines">
                                {item.lines.map((l) => <div className="file-deep-search__line"
                                                          key={l.line}
                                                          onClick={() => open_item(item)}>
                                    <span className="file-deep-search__line-no">{l.line}</span>
                                    <span className="file-deep-search__line-text">{l.text}</span>
                                </div>)}
                            </div>}
                        </div>
                        <div className="file-deep-search__actions">
                            <ActionButton icon={"open_in_new"} title={item.is_dir ? t("打开") : t("打开文件")}
                                          onClick={() => open_item(item)}/>
                            <ActionButton icon={"folder_open"} title={t("打开所在目录")}
                                          onClick={() => jump(item)}/>
                        </div>
                    </div>;
                })}
            </div>}
            {searching && <div className="file-deep-search__empty">
                <span className="chat-session-running" title={t("搜索中")}/>
                {t("搜索中")}
            </div>}
            {!searching && total > MAX_RENDER && <div className="file-deep-search__more">
                {t("结果过多")}
            </div>}
            {!searching && list.length === 0 && <div className="file-deep-search__empty">
                {searched ? t("无匹配") : (is_content ? t("输入内容后搜") : t("输入后搜"))}
            </div>}
        </div>
    </div>;
}
