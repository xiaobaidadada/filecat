import React, {useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAtom} from "jotai";
import {useTranslation} from "react-i18next";
import {$stroe} from "../../util/store";
import {file_deep_search_item, file_deep_search_req} from "../../../../common/req/file.req";
import {routerConfig} from "../../../../common/RouterConfig";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {WsClient} from "../../../../common/frame/ws.client";
import {InputTextIcon} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";
import {Table} from "../../../meta/component/Table";
import {TextTip} from "../../../meta/component/Card";

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
    const [keyword, setKeyword] = useState("");
    const [searching, setSearching] = useState(false);
    const [list, setList] = useState<file_deep_search_item[]>([]);
    // 本次搜索命中的总条数。list 只保留能渲染的部分，总数要单独记，用于判断结果是否超出
    const [total, setTotal] = useState(0);
    // 是否已经搜过一次（用于区分「还没搜」和「搜了但没结果」）
    const [searched, setSearched] = useState(false);
    // WS 连接由这个弹窗独占，关闭时一并断开
    const ws = useMemo(() => new WsClient(window.location.host, "file_deep_search"), []);
    // 必须在 setClose 之前就先断开，避免 React 卸载后又触发一次状态更新
    const closed = useRef(false);
    // 路由里的路径是 URL 编码的，展示给用户时要解码，否则中文目录会显示成 %E6%B5%8B
    const show_path = decodeURIComponent(props.base_path);

    const close = () => set_prompt_card({open: false});

    useEffect(() => {
        // 攒一批再渲染，避免命中很多时每来一条都触发一次 React 更新
        let buffer: file_deep_search_item[] = [];
        let flush_timer: any = null;
        const flush = () => {
            flush_timer = null;
            if (closed.current || !buffer.length) return;
            const batch = buffer;
            buffer = [];
            setTotal(prev => prev + batch.length);
            // 只把前面的结果放进列表，超出部分不再渲染（总数仍然累计，用于提示）
            setList(prev => prev.length >= MAX_RENDER ? prev : [...prev, ...batch].slice(0, MAX_RENDER));
        };
        const on_data = (data: WsData<file_deep_search_item[]>) => {
            if (closed.current) return;
            buffer.push(...(data.context ?? []));
            if (flush_timer === null) flush_timer = setTimeout(flush, 100);
        };
        const on_end = () => {
            if (closed.current) return;
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
            // sendData 是「发出去 + 等回包」的请求模式，而 cancel 是单向通知（后端不会回包），
            // 所以这里必然等不到回包、6 秒后由 ws.client 超时 reject（reject 值还不是 Error），
            // 必须 catch 掉，否则会变成未处理的 Promise 拒绝
            closed.current = true;
            clearTimeout(flush_timer);
            ws.sendData(CmdType.file_deep_search_cancel, {}).catch(() => {
            });
            ws.off_message("close", on_close);
            ws.close();
        };
    }, []);

    const search = () => {
        const k = keyword.trim();
        if (!k || searching) {
            return;
        }
        setList([]);
        setTotal(0);
        setSearched(true);
        setSearching(true);
        const req: file_deep_search_req = {
            param_path: props.base_path,
            keyword: k,
        };
        // 后端 handler 立即回包（搜索在后台跑），所以这里正常能收到；加 catch 只是兜底网络异常
        ws.sendData(CmdType.file_deep_search, req).catch(() => {
        });
    };

    const cancel = () => {
        // 同卸载：cancel 是单向通知，后端不回包，必然超时 reject，catch 掉避免未处理的拒绝
        ws.sendData(CmdType.file_deep_search_cancel, {}).catch(() => {
        });
        setSearching(false);
    };

    // 跳转。后端返回的 path 是相对系统根目录的完整 web 路径（以 / 开头），
    // 可直接作为文件路由的路径：目录直接进入，文件则跳到它所在的目录。
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

    return <div className="file-deep-search">
        <div className="file-deep-search__bar">
            <InputTextIcon icon={"search"}
                           value={keyword}
                           placeholder={t("搜文件名")}
                           handleInputChange={(v) => setKeyword(v)}
                           handleEnterPress={search}/>
            <button className="button button--flat" onClick={searching ? cancel : search}>
                {searching ? t("取消") : t("搜索")}
            </button>
        </div>
        <div className="file-deep-search__hint">
            <span>{t("范围")}：{show_path}</span>
            {total > 0 && <span className="file-deep-search__count">
                {total > MAX_RENDER ? `${t("已显示")} ${MAX_RENDER} / ${total}` : `${total}`}
            </span>}
        </div>
        <div className="file-deep-search__body">
            {list.length > 0 && <Table headers={[t("名称"), t("路径"), ""]}
                   rows={list.map((item) => {
                       const dir = item.path.slice(0, item.path.lastIndexOf("/") + 1);
                       return [
                           item.is_dir
                               ? <span className="file-deep-search__dir">{item.name}</span>
                               : item.name,
                           <TextTip context={dir}/>,
                           <ActionButton icon={"folder_open"} title={t("打开所在目录")}
                                         onClick={() => jump(item)}/>,
                       ];
                   })}/>}
            {searching && <div className="file-deep-search__empty">
                <span className="chat-session-running" title={t("搜索中")}/>
                {t("搜索中")}
            </div>}
            {!searching && total > MAX_RENDER && <div className="file-deep-search__more">
                {t("结果过多")}
            </div>}
            {!searching && list.length === 0 && <div className="file-deep-search__empty">
                {searched ? t("无匹配") : t("输入后搜")}
            </div>}
        </div>
    </div>;
}
