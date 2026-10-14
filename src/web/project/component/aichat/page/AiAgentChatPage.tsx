/**
 * AiAgentChatPage — AI 聊天页面
 *
 * 聊天界面本体已抽成通用组件 ChatPanel，本页面只负责「整页模式」的挂载：
 *   - Header 按钮走全局 HeaderPortal（默认行为）
 *   - 当前会话同步到 URL 的 ?session=
 *
 * 需要把聊天整体嵌到别的页面（例如 Studio 右侧面板）时，直接复用 ChatPanel，
 * 传 inline_header / sync_url=false 即可。
 */
import React from 'react';
import ChatPanel from "./ChatPanel";

export default function AiAgentChatPage() {
    return <ChatPanel/>;
}
