import React, {useRef, useState} from 'react';
import {useTranslation} from "react-i18next";

import {Icon, ActionButton} from "../../../../meta/component/Button";
import {MenuSelect, OverlayTransparent} from "../../../../meta/component/Dashboard";
import {ai_agent_chat_session_meta, ai_system_prompt_item} from "../../../../../common/req/filecat.ai.pojo";
import SessionMetaList, {SessionMetaItem} from "./SessionMetaList";

function toSessionTitle(title: string) {
    return title || "新会话";
}

/**
 * AI 会话列表面板
 * 包含搜索、会话列表、底部操作栏（批量选择 / 删除全部）
 */
export default function SessionList({
                                        sessions,
                                        activeSessionId,
                                        onSelectSession,
                                        onReorderSessions,
                                        onRenameSession,
                                        onDeleteSession,
                                        onToggleCmdAuto,
                                        onShowUsageStats,
                                        onShowSessionSetting,
                                        batchMode,
                                        selectedSessionIds,
                                        onToggleSessionSelect,
                                        onToggleBatchMode,
                                        onBatchDeleteSessions,
                                        onClearAllSessions,
                                        /** 是否处于「查看所有用户会话」模式（仅超级管理员可见该入口） */
                                        allUsersMode,
                                        onToggleAllUsersMode,
                                        /** 是否显示「所有用户会话」入口（root） */
                                        showAllUsersEntry,
                                        /** 系统提示词列表（供会话菜单选择） */
                                        sysPromptList,
                                        /** 修改指定会话的系统提示词 */
                                        onChangeSysPrompt,
                                    }: {
    sessions: (ai_agent_chat_session_meta & { user_id?: string; owner_name?: string })[];
    activeSessionId: string;
    onSelectSession: (id: string) => void;
    /** 拖动排序回调：传入被拖项与落点项的会话 id */
    onReorderSessions?: (from_id: string, to_id: string) => void;
    onRenameSession: (id: string, title: string) => void;
    onDeleteSession: (id: string) => void;
    onToggleCmdAuto?: (id: string, allow: boolean) => void;
    onShowUsageStats: (id: string) => void;
    /** 打开「会话设置」弹框（配置该会话的服务器工作目录） */
    onShowSessionSetting?: (id: string) => void;
    batchMode?: boolean;
    selectedSessionIds?: Set<string>;
    onToggleSessionSelect?: (id: string) => void;
    onToggleBatchMode?: () => void;
    onBatchDeleteSessions?: () => void;
    onClearAllSessions?: () => void;
    allUsersMode?: boolean;
    onToggleAllUsersMode?: () => void;
    showAllUsersEntry?: boolean;
    sysPromptList?: ai_system_prompt_item[];
    onChangeSysPrompt?: (session_id: string, sys_prompt_id: string) => void;
}) {
    const {t} = useTranslation();
    const [searchText, setSearchText] = useState('');
    // 列表容器引用：用于把当前选中会话滚动到可见区域
    const items_wrap_ref = useRef<HTMLDivElement>(null);
    // 拖动排序状态：拖动源下标 / 当前悬停的目标下标
    const [drag_index, set_drag_index] = useState<number | null>(null);
    const [over_index, set_over_index] = useState<number | null>(null);
    // 会话操作菜单：记录位置与目标会话，复用项目统一的 MenuSelect 弹出
    const [menu, set_menu] = useState<{ x: number, y: number, session: ai_agent_chat_session_meta } | null>(null);

    // 「所有用户会话」模式下跨用户排序无意义，禁用拖动排序
    const can_reorder = !!onReorderSessions && !allUsersMode;

    /** 按 id 找系统提示词的显示名（note 优先，否则截取正文） */
    const sys_prompt_name_of = (id?: string) => {
        if (!id) return "";
        const item = sysPromptList?.find(it => String(it.index) === String(id));
        if (!item) return "";
        return item.note || item.prompt.slice(0, 20);
    };

    /**
     * 会话行副信息标签：消息数 / 系统提示词 / 来源 / 属主
     * 空值项由 SessionMetaList 统一过滤
     */
    const build_meta_items = (session: ai_agent_chat_session_meta): SessionMetaItem[] => [
        {text: String(session.message_count ?? ''), className: 'chat-session-meta__count', title: t('消息数')},
        {
            text: sys_prompt_name_of(session.sys_prompt_id),
            className: 'chat-session-meta__prompt',
            title: t('系统提示词')
        },
        {
            text: session.source !== 'web' ? session.source : '',
            className: 'chat-session-meta__source',
            title: t('来源')
        },
        {
            text: allUsersMode ? (session.owner_name || '') : '',
            className: 'chat-session-meta__owner',
            title: session.owner_name
        },
    ];

    /**
     * 构建会话操作菜单项。
     * 复用项目 Dropdown 的 items 结构：{r: 显示内容, v: 值, items?: 二级子菜单}
     * 父项（带 items）不带 v，DropdownItem 无 v 时不会触发 click，只负责展开子菜单。
     */
    const build_menu_items = (session: ai_agent_chat_session_meta) => {
        const items: any[] = [
            {r: t('重命名'), v: 'rename', run: () => onRenameSession(session.id, session.title)},
            // 「所有用户会话」模式下跨用户排序无意义，隐藏这两项
            ...(allUsersMode ? [] : [
                {
                    r: t('移动到最上'), v: 'to_top', run: () => {
                        const first = filteredSessions[0];
                        if (first && first.id !== session.id) onReorderSessions?.(session.id, first.id);
                    }
                },
                {
                    r: t('移动到最下'), v: 'to_bottom', run: () => {
                        const last = filteredSessions[filteredSessions.length - 1];
                        if (last && last.id !== session.id) onReorderSessions?.(session.id, last.id);
                    }
                },
            ]),
            {
                r: session.cmd_auto_allow ? t('命令检测关闭') : t('命令检测开启'),
                v: 'cmd_auto',
                run: () => onToggleCmdAuto?.(session.id, !session.cmd_auto_allow)
            },
        ];
        // 系统提示词：二级子菜单，当前生效的那项由 pre_value 高亮
        if (sysPromptList?.length) {
            items.push({
                r: t('系统提示词'),
                items: [
                    {r: t('不使用'), v: '', run: () => onChangeSysPrompt?.(session.id, '')},
                    ...sysPromptList.map(it => ({
                        r: sys_prompt_name_of(String(it.index)),
                        v: String(it.index),
                        run: () => onChangeSysPrompt?.(session.id, String(it.index))
                    }))
                ]
            });
        }
        items.push(
            {r: t('字符消耗统计'), v: 'usage', run: () => onShowUsageStats(session.id)},
            {r: t('设置'), v: 'setting', run: () => onShowSessionSetting?.(session.id)},
            {r: t('删除'), v: 'delete', run: () => onDeleteSession(session.id)},
        );
        return items;
    };

    const filteredSessions = searchText.trim()
        ? sessions.filter(s => (s.title || '').toLowerCase().includes(searchText.toLowerCase())
            || (s.summary || '').toLowerCase().includes(searchText.toLowerCase())
            || (s.long_term_memory || '').toLowerCase().includes(searchText.toLowerCase())
            // 「所有用户会话」模式下支持按属主名搜索
            || (allUsersMode && (s.owner_name || '').toLowerCase().includes(searchText.toLowerCase())))
        : sessions;

    /** 当前选中的会话（可能被搜索过滤掉，因此从完整列表中取） */
    const current_session = sessions.find(s => s.id === activeSessionId);

    /**
     * 滚动到当前选中会话所在位置。
     * 列表用 [data-session-id] 定位；被搜索过滤掉时先清空搜索再滚动。
     */
    const scroll_to_session = (id: string) => {
        const scroll = () => {
            const wrap = items_wrap_ref.current;
            const el = wrap?.querySelector<HTMLElement>(`[data-session-id="${id}"]`);
            if (!el) return;
            // behavior: 'smooth' 让跳动有过程，用户能看清落点
            el.scrollIntoView({block: 'center', behavior: 'smooth'});
        };
        if (!filteredSessions.some(s => s.id === id)) {
            // 当前会话不在过滤结果里：清空搜索，等列表重新渲染后再滚动
            setSearchText('');
            requestAnimationFrame(() => requestAnimationFrame(scroll));
            return;
        }
        scroll();
    };

    // 拖动结束：回调被拖项与落点项的具体 id，由上层按 id 重排（避免过滤时下标错位）
    const handle_drop = (to: number) => {
        const from = drag_index;
        set_drag_index(null);
        set_over_index(null);
        if (from === null || from === to || !onReorderSessions) return;
        const from_id = filteredSessions[from]?.id;
        const to_id = filteredSessions[to]?.id;
        if (!from_id || !to_id) return;
        onReorderSessions(from_id, to_id);
    };

    return (
        <>
        <aside className="chat-session-list">
            <div className="chat-session-search">
                <input
                    type="text"
                    className="chat-session-search-input"
                    placeholder={t('搜索会话')}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
                {/* 当前选中会话：与搜索框一起固定显示，点击滚动到该会话位置 */}
                {current_session && (
                    <button
                        className="chat-session-current"
                        title={toSessionTitle(current_session.title)}
                        onClick={() => scroll_to_session(current_session.id)}
                    >
                        <i className="material-icons">my_location</i>
                        <span>{toSessionTitle(current_session.title)}</span>
                    </button>
                )}
            </div>
            <div className="chat-session-items-wrap" ref={items_wrap_ref}>
                {filteredSessions.map((session, index) => (
                    <div key={session.id} data-session-id={session.id}>
                        <button
                            className={`chat-session-item ${activeSessionId === session.id ? "active" : ""} ${batchMode ? 'batch-mode' : ''} ${session.running ? 'is-running' : ''} ${drag_index === index ? 'row-dragging' : ''} ${over_index === index && drag_index !== null && drag_index !== index ? 'row-drop-target' : ''}`}
                            // ===== 拖动排序：仅开启排序回调且非「所有用户会话」模式时生效 =====
                            draggable={can_reorder}
                            onDragStart={() => set_drag_index(index)}
                            onDragOver={(e) => {
                                if (drag_index === null) return;
                                e.preventDefault();
                                if (over_index !== index) set_over_index(index);
                            }}
                            onDragEnd={() => { set_drag_index(null); set_over_index(null); }}
                            onDrop={(e) => { e.preventDefault(); handle_drop(index); }}
                            onClick={() => {
                                if (batchMode && onToggleSessionSelect) {
                                    onToggleSessionSelect(session.id);
                                } else {
                                    onSelectSession(session.id);
                                }
                            }}
                            title={session.summary || session.long_term_memory || session.title}
                        >
                            {batchMode && (
                                <input
                                    type="checkbox"
                                    className="chat-session-checkbox"
                                    checked={selectedSessionIds?.has(session.id) ?? false}
                                    onChange={() => onToggleSessionSelect?.(session.id)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )}
                            <span>{toSessionTitle(session.title)}</span>
                            {/* 会话正在执行中：显示旋转 loading 动画 */}
                            {session.running && <span className="chat-session-running" title={t('正在执行中')} />}
                            {/* 副信息统一走标签列表渲染，间距与背景由容器控制 */}
                            <SessionMetaList items={build_meta_items(session)}/>
                            {!batchMode && (
                                <i
                                    className="chat-session-more material-icons"
                                    title={t('更多操作')}
                                    onClick={(e) => {
                                        // 阻止冒泡，避免顺带触发会话选中
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        // 菜单从图标右下方弹出，MenuSelect 会自行做边界修正
                                        set_menu({x: rect.right, y: rect.bottom, session});
                                    }}
                                >more_horiz</i>
                            )}
                        </button>
                    </div>
                ))}
            </div>
            {/* 底部操作栏：始终渲染，桌面端 collapsed 窄栏时通过 CSS 隐藏 */}
            <div className="chat-session-actions">
                <ActionButton
                    icon={batchMode ? "check_circle" : "checklist"}
                    title={batchMode ? t("取消批量选择") : t("批量选择")}
                    onClick={onToggleBatchMode}
                />
                {showAllUsersEntry && !batchMode && (
                    <ActionButton
                        icon={allUsersMode ? "person" : "groups"}
                        title={allUsersMode ? t("仅看我的会话") : t("查看所有用户会话")}
                        onClick={onToggleAllUsersMode}
                    />
                )}
                {batchMode && (selectedSessionIds?.size ?? 0) > 0 && (
                    <ActionButton
                        icon={"delete"}
                        title={t("删除选中会话")}
                        onClick={onBatchDeleteSessions}
                    />
                )}
                {!batchMode && onClearAllSessions && (
                    <ActionButton
                        icon={"delete_sweep"}
                        title={t("删除全部会话")}
                        onClick={onClearAllSessions}
                    />
                )}
            </div>
        </aside>
        {/* 会话操作菜单：复用项目统一的 MenuSelect（自带边界修正与二级子菜单） */}
        {menu && (
            <OverlayTransparent click={() => set_menu(null)}>
                <MenuSelect
                    x={menu.x}
                    y={menu.y}
                    items={build_menu_items(menu.session)}
                    pre_value={menu.session.sys_prompt_id ? String(menu.session.sys_prompt_id) : ''}
                    click={(v, item) => {
                        set_menu(null);
                        item?.run?.();
                    }}
                />
            </OverlayTransparent>
        )}
    </>
    );
}
