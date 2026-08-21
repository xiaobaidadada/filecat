import fs from "fs";
import path from "path";
import fse from "fs-extra";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, data_dir_tem_name} from "../data/data_type";
import {aiAgentLongTermMemoryService} from "./ai_agent.long_term_memory";
import {ai_agentService} from "./ai_agent.service";
import {llmPost, readLlmResponse} from "./llm_request";
import {
    ai_agent_chat_session_item,
    ai_agent_chat_session_meta, ai_agent_message_attachment_item, ai_agent_message_item, ai_agent_message_list,
    ai_agent_usage_stats, ai_agent_item_dotenv, getContentAsString,
} from "../../../common/req/filecat.ai.pojo";
import {estimateTokenCount} from "./token_counter";

type SessionMeta = ai_agent_chat_session_meta & {
    file_name: string;
};

type SessionIndexStore = {
    version: number;
    users: {
        [userId: string]: {
            sessions: SessionMeta[];
        };
    };
};

// 三个配置的默认值，当 env 未传或未设置时使用
const DEFAULT_MAX_RECENT_MESSAGES = 12;
const DEFAULT_COMPRESS_MESSAGE_COUNT = 16;
const DEFAULT_MAX_TOOL_CONTENT_CHARS = 200;

//  id of session
function nowId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeName(text:string) {
    return (text || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function cloneSession(session: ai_agent_chat_session_item): ai_agent_chat_session_item {
    return {
        ...session,
        messages: [...(session.messages ?? [])],
        summary: session.summary ?? "",
        long_term_memory: session.long_term_memory ?? "",
        usage_stats: session.usage_stats ? {...session.usage_stats} : undefined,
    };
}

// 序列化json
function normalizeAttachment(attachment: ai_agent_message_attachment_item): ai_agent_message_attachment_item {
    return {
        name: attachment.name ?? "unknown",
        mime_type: attachment.mime_type,
        size: attachment.size ?? 0,
        kind: attachment.kind ?? "text",
        content: attachment.content ?? ""
    };
}

function llm_normalizeMessage_one(message: ai_agent_message_item) {
    // delete (rest as Record<string, unknown>)['call_list'];
    const normalized: ai_agent_message_item = {
        // 这些字段是 llm 能够识别的字段
        // ...rest,
        role: message.role,
        content: message.content ?? "",
        // tool_call_id: message.tool_call_id,
        attachments: (message.attachments ?? []).map(normalizeAttachment),
    };
    if (message.tool_calls?.length) {
        normalized.tool_calls = message.tool_calls
        // normalized.tool_calls = message.tool_calls.map(v=>{
        //     if(v.function?.arguments) {
        //         v.function.arguments = v.function.arguments.slice(-MAX_TOOL_CONTENT_CHARS)+";省略..."
        //     }
        //     return v
        // });
    }
    if(normalized.attachments?.length) {
        const contentStr = getContentAsString(normalized.content);
        return  {
            role: normalized.role,
            content: `${normalized.attachments.map(formatAttachment).join("\n")} \n ${contentStr}`.trim(),
            tool_call_id: normalized.tool_call_id
        }
    }
    return normalized
}

/**
 * 将 message 标准化为 LLM 可识别的格式（可能输出多条，如 assistant + tool results）
 * @param message 原始消息
 * @param _interrupted
 * @param maxToolContentChars 历史消息中 tool 输出的最大字符数
 */
function llm_normalizeMessage(message: ai_agent_message_item, _interrupted:boolean, maxToolContentChars?: number) {
    const toolContentLimit = maxToolContentChars ?? DEFAULT_MAX_TOOL_CONTENT_CHARS;
    const list:ai_agent_message_item[] = []
    if(message.content_list?.length) {
        for (const it of message.content_list) {
            list.push(...llm_normalizeMessage(it, _interrupted, toolContentLimit))
        }
        return list;
    }
    const normalized = llm_normalizeMessage_one(message)
    list.push(normalized)
    if(normalized.attachments?.length) {
        return list;
    }
    // 已执行的工具结果（tool_call_ends 里的每一项都对应一条 tool 响应消息）
    let toolResponseCount = 0;
    if(message.tool_call_ends?.length) {
        for (const it of message.tool_call_ends) {
            const raw = it.tool_result ?? it.error ?? "";
            // 最近一条 assistant 的 tool 结果不截断（可能是网络中断恢复，需要完整结果让 AI 知道 tool 已完成）
            if (_interrupted || raw.length <= toolContentLimit) {
                list.push({
                    role: "tool",
                    tool_call_id: it.tool_call_id,
                    content: raw
                })
            } else {
                list.push({
                    role: "tool",
                    tool_call_id: it.tool_call_id,
                    content: raw.slice(0, toolContentLimit) + "\n[...已截断]"
                })
            }
            toolResponseCount++;
        }
    }
    // 防脏数据兜底：若 assistant 声明了 tool_calls，但对应的 tool 响应消息数量不足
    // （典型场景：用户中途“停止”，LLM 已返回 tool_calls 但工具尚未执行完，导致保存的
    //   消息里只有带 tool_calls 的 assistant、没有对应的 tool 响应。）
    // OpenAI 要求“带 tool_calls 的 assistant 消息必须紧跟对应数量的 tool 响应消息”，
    // 否则下一次请求会报
    //   “An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'”。
    // 这里把缺失的 tool 响应补齐，避免历史 session 因中断残留不完整序列而报错。
    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length > toolResponseCount) {
        for (const tc of toolCalls) {
            // 该 tool_call 没有对应的 tool_call_end（未执行完成），补一条“中断”占位响应
            const already = (message.tool_call_ends ?? []).some(end => end.tool_call_id === tc.id);
            if (!already && tc.id) {
                list.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: "[该工具调用因对话被中断而未执行完成，无结果返回。]"
                });
            }
        }
    }
    return list;
}

function formatAttachment(attachment: ai_agent_message_attachment_item) {
    return [
        "\n",
        `[附件 ${attachment.name}]`,
        `${attachment.name} mime类型: ${attachment.mime_type ?? "unknown"} `,
        `${attachment.name} 大小: ${attachment.size ?? 0} bytes`,
        `${attachment.name} 类型: ${attachment.kind ?? "text"}`,
        `${attachment.name} 文件内容:\n ${attachment.content ? attachment.content : "[内容为空或无法预览]"}`
    ].join("\n");
}

// 格式化消息，把 json 结构化的数据字符串化给 llm 用
function llm_render_message(content:ai_agent_message_list, message: ai_agent_message_item, maxToolContentChars?: number) {
    const normalized = llm_normalizeMessage(message, message._interrupted, maxToolContentChars);
    content.push(...normalized)
}

export class AiAgentMemoryService {
    private sessionRoot() {
        return DataUtil.get_tem_path(data_dir_tem_name.ai_agent_chat_session_dir);
    }

    private userDir(userId: string) {
        const dir = path.join(this.sessionRoot(), safeName(userId));
        fse.ensureDirSync(dir);
        return dir;
    }

    private sessionPath(userId: string, fileName: string) {
        return path.join(this.userDir(userId), safeName(fileName));
    }

    private sessionFileName(sessionId: string) {
        return `${safeName(sessionId)}.json`;
    }

    // index of session
    private read_index_of_session():SessionIndexStore {
        const store = DataUtil.get<SessionIndexStore>(data_common_key.ai_agent_chat_session_store) ?? {
            version: 2,
            users: {}
        };
        store.version = 2;
        store.users = store.users ?? {};
        return store;
    }

    private saveIndex(store: SessionIndexStore) {
        DataUtil.set(data_common_key.ai_agent_chat_session_store, store);
    }

    private user_meta_index_by_store(store: SessionIndexStore, userId: string) {
        if (!store.users[userId]) {
            store.users[userId] = {sessions: []};
        }
        store.users[userId].sessions = store.users[userId].sessions ?? [];
        return store.users[userId];
    }

    private toMeta(session: ai_agent_chat_session_item, fileName: string): SessionMeta {
        return {
            id: session.id,
            title: session.title,
            message_count: session.messages?.length ?? 0,
            summary: session.summary,
            long_term_memory: session.long_term_memory,
            source: session.source,
            created_at: session.created_at,
            updated_at: session.updated_at,
            file_name: fileName,
            usage_stats: session.usage_stats ? {...session.usage_stats} : undefined,
            cmd_auto_allow: session.cmd_auto_allow ?? false,
        };
    }

    private writeSession(userId: string, session: ai_agent_chat_session_item, fileName?: string) {
        const nextFileName = fileName || this.sessionFileName(session.id);
        fs.writeFileSync(this.sessionPath(userId, nextFileName), JSON.stringify(session));
        return nextFileName;
    }

    private read_session(userId: string, meta: SessionMeta) {
        try {
            const fileName = meta.file_name || this.sessionFileName(meta.id);
            const filePath = this.sessionPath(userId, fileName);
            if (!fs.existsSync(filePath)) return null;
            const session = JSON.parse(fs.readFileSync(filePath).toString()) as ai_agent_chat_session_item;
            session.summary = session.summary ?? "";
            session.long_term_memory = session.long_term_memory ?? "";
            session.source = session.source ?? meta.source;
            return session;
        } catch (e) {
            console.log("read ai chat session failed", e);
            return null;
        }
    }

    private upsertMeta(store: SessionIndexStore, userId: string, session: ai_agent_chat_session_item, fileName?: string) {
        const user = this.user_meta_index_by_store(store, userId);
        const nextFileName = fileName || this.sessionFileName(session.id);
        const meta = this.toMeta(session, nextFileName);
        const index = user.sessions.findIndex(it => it.id === session.id);
        if (index >= 0) {
            user.sessions[index] = meta;
        } else {
            user.sessions.unshift(meta);
        }
        user.sessions = user.sessions.sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
        this.saveIndex(store);
    }

    private findMetaBySource(userId: string, source: "web" | "cli" | "robot_qq" | "robot_dingtalk" | "robot_wecom" | "robot_lark" | "robot_wecom" | "robot_lark") {
        const store = this.read_index_of_session();
        return this.user_meta_index_by_store(store, userId).sessions.find(it => it.source === source) ?? null;
    }

    public list(userId: string): ai_agent_chat_session_meta[] {
        const store = this.read_index_of_session();
        return this.user_meta_index_by_store(store, userId).sessions
            .slice()
            .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
            .map(it => ({
                id: it.id,
                title: it.title,
                message_count: it.message_count ?? 0,
                summary: it.summary,
                long_term_memory: it.long_term_memory,
                source: it.source,
                created_at: it.created_at,
                updated_at: it.updated_at,
                usage_stats: it.usage_stats ? {...it.usage_stats} : undefined,
                cmd_auto_allow: it.cmd_auto_allow ?? false,
            }));
    }

    public get_session(userId: string, sessionId: string) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return null;
        const session = this.read_session(userId, meta);
        return session ? cloneSession(session) : null;
    }

    public create_session(userId: string, title = "新会话", source: "web" | "cli" | "robot_qq" | "robot_dingtalk" | "robot_wecom" | "robot_lark" | "robot_wecom" | "robot_lark" = "web",sys_prompt_id?:string,sessionId?:string) {
        const store = this.read_index_of_session();
        const session: ai_agent_chat_session_item = {
            id: sessionId??nowId(),
            title,
            messages: [],
            summary: "",
            long_term_memory: "",
            source,
            created_at: Date.now(),
            updated_at: Date.now(),
            sys_prompt_id: sys_prompt_id,
        };
        const fileName = this.writeSession(userId, session);
        this.upsertMeta(store, userId, session, fileName);
        return cloneSession(session);
    }

    public ensure_session(userId: string, sessionId?: string, title?: string, source: "web" | "cli" | "robot_qq" | "robot_dingtalk" | "robot_wecom" | "robot_lark" | "robot_wecom" | "robot_lark" = "web", sys_prompt_id?:string, ensureSessionId?:string) {
        if (sessionId) {
            const session = this.get_session(userId, sessionId);
            if (session) return session;
        }
        return this.create_session(userId, title, source, sys_prompt_id, ensureSessionId);
    }

    public ensure_single_session(userId: string, source: "web" | "cli" | "robot_qq" | "robot_dingtalk" | "robot_wecom" | "robot_lark" | "robot_wecom" | "robot_lark", title: string) {
        const meta = this.findMetaBySource(userId, source);
        if (meta) {
            return this.get_session(userId, meta.id);
        }
        return this.create_session(userId, title, source);
    }

    public delete(userId: string, sessionId: string) {
        const store = this.read_index_of_session();
        const user = this.user_meta_index_by_store(store, userId);
        const meta = user.sessions.find(it => it.id === sessionId);
        if (meta) {
            const filePath = this.sessionPath(userId, meta.file_name || this.sessionFileName(sessionId));
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        user.sessions = user.sessions.filter(it => it.id !== sessionId);
        this.saveIndex(store);
    }

    public clear(userId: string) {
        const store = this.read_index_of_session();
        const user = this.user_meta_index_by_store(store, userId);
        for (const meta of user.sessions) {
            const filePath = this.sessionPath(userId, meta.file_name || this.sessionFileName(meta.id));
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        user.sessions = [];
        this.saveIndex(store);
    }

    // 更新消息到会话 整体更新（不推荐使用，消息量大时请求体可能超限，优先使用 delete_messages_from_session）
    public update_messages_to_session(userId: string, sessionId: string, messages: ai_agent_message_list) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return;
        const session = this.read_session(userId, meta);
        if (!session) return;
        session.messages = (messages ?? [])
            .filter(it => (it?.content || it?.attachments?.length) && (it.role === "user" || it.role === "assistant"))
            .map(llm_normalizeMessage_one);
        session.updated_at = Date.now();
        const fileName = this.writeSession(userId, session, meta.file_name);
        this.upsertMeta(store, userId, session, fileName);
    }

    /**
     * 增量删除会话中的指定消息（按索引删除，避免整体覆盖导致请求体过大）
     * @param userId 用户 ID
     * @param sessionId 会话 ID
     * @param indices 要删除的消息在 messages 数组中的索引（从 0 开始），会自动排序并去重
     */
    public delete_messages_from_session(userId: string, sessionId: string, indices: number[]) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return;
        const session = this.read_session(userId, meta);
        if (!session) return;
        if (!session.messages?.length) return;

        // 对索引去重并降序排序（降序 splice 不会影响前面的索引）
        const sortedIndices = [...new Set(indices)]
            .filter(i => i >= 0 && i < session.messages.length)
            .sort((a, b) => b - a);

        for (const idx of sortedIndices) {
            session.messages.splice(idx, 1);
        }

        session.updated_at = Date.now();
        const fileName = this.writeSession(userId, session, meta.file_name);
        this.upsertMeta(store, userId, session, fileName);
    }

    public sessions_update_meta(userId: string, session:ai_agent_chat_session_meta ) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === session.id);
        if (!meta) return;
        meta.title = session.title;
        this.saveIndex(store);
        // 同步更新 session 文件中的 title，防止 appendTurn 回写时覆盖掉用户修改的标题
        try {
            const sessionData = this.read_session(userId, meta);
            if (sessionData) {
                sessionData.title = session.title;
                this.writeSession(userId, sessionData, meta.file_name);
            }
        } catch (e) {
            console.error("sessions_update_meta: 同步更新 session 文件失败", e);
        }
    }

    /**
     * 更新会话的“系统提示词 ID”（选择/切换后持久化，下次加载会话自动选中）
     * @param userId 用户 ID
     * @param sessionId 会话 ID
     * @param sys_prompt_id 系统提示词 ID（可能为空字符串表示清除）
     */
    public update_sys_prompt(userId: string, sessionId: string, sys_prompt_id?: string) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return;
        const session = this.read_session(userId, meta);
        if (!session) return;
        // 空/undefined 均视为清除该系统提示词
        session.sys_prompt_id = sys_prompt_id || undefined;
        this.writeSession(userId, session, meta.file_name);
    }

    /**
     * 更新会话的“命令检测”开关状态（开启后该会话执行命令不再弹确认框，自动允许）
     * @param userId 用户 ID
     * @param sessionId 会话 ID
     * @param allow 是否开启免确认
     */
    public sessions_update_cmd_auto_allow(userId: string, sessionId: string, allow: boolean) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return;
        const session = this.read_session(userId, meta);
        if (!session) return;
        session.cmd_auto_allow = allow;
        const fileName = this.writeSession(userId, session, meta.file_name);
        this.upsertMeta(store, userId, session, fileName);
    }

    private get_origin_session(userId: string, sessionId: string) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return;
        const session = this.read_session(userId, meta);
        if (!session) return;
        session.messages = session.messages ?? [];
        return {session,meta,store};
    }

    /**
     * 仅追加一条消息到会话（轻量写入）
     * 与 appendTurn 不同：不做 token 统计、不触发压缩、不改标题、不提取长期记忆，
     * 纯粹把一条消息追加到末尾并落盘，适用于“手动补充/注入一条消息”等场景。
     * @param userId 用户 ID
     * @param sessionId 会话 ID
     * @param message 要追加的消息（会被标准化为 LLM 可识别的格式）
     */
    public append_message_to_session(userId: string, sessionId: string, message: ai_agent_message_item) {
        const r = this.get_origin_session(userId,sessionId);
        if(!r)return;
        const {session,meta,store} = r;
        // 标准化消息，保证与历史消息结构一致（role/content/attachments/tool_calls）
        session.messages.push(llm_normalizeMessage_one(message));
        session.updated_at = Date.now();
        const fileName = this.writeSession(userId, session, meta.file_name);
        this.upsertMeta(store, userId, session, fileName);
    }

    // 将本次机器人的聊天结果加入到历史会话中
    public async appendTurn(userId:string, sessionId:string, userMessage:ai_agent_message_item, assistantMessage:ai_agent_message_item, turnStats?: { output_tokens?: number;input_tokens?: number; }, env?: ai_agent_item_dotenv) {
        const r = this.get_origin_session(userId,sessionId);
        if(!r)return;
        const {session,meta,store} = r;
        // 历史处理
        for (const message of session.messages) {
            message._interrupted = false
        }
        session.messages.push(userMessage);
        session.messages.push(assistantMessage);
        session.updated_at = Date.now();

        // 预计算消息 token 并写入字段，持久化后压缩判断直接读
        const [userTokens, assistantTokens] = await Promise.all([
            estimateTokenCount(this.getMessageText(userMessage)),
            estimateTokenCount(this.getMessageText(assistantMessage)),
        ]);
        userMessage.token_count = userTokens;
        assistantMessage.token_count = assistantTokens;

        // 更新 token 消耗统计
        if (!session.usage_stats) {
            session.usage_stats = new ai_agent_usage_stats();
        }
        const stats = session.usage_stats;
        stats.turns = (stats.turns || 0) + 1;

        // 如果传入了 turnStats，使用传入的值；否则使用自动计算的值
        const inputTokens = turnStats?.input_tokens ?? userTokens;
        const outputTokens = turnStats?.output_tokens ?? assistantTokens;

        stats.input_tokens = (stats.input_tokens || 0) + inputTokens;
        stats.recent_input_tokens = inputTokens;
        stats.output_tokens = (stats.output_tokens || 0) + outputTokens;
        stats.recent_output_tokens = outputTokens;

        if (!session.title || session.title === "新会话") {
            session.title = this.createTitle(getContentAsString(userMessage.content));
        }
        await this.compressIfNeeded(session, env);

        // 将会话的长期记忆同步到周/月/年/永久文件（跨会话持久化）
        if (session.long_term_memory) {
            aiAgentLongTermMemoryService.syncMemory(session);
        }

        const fileName = this.writeSession(userId, session, meta.file_name);
        this.upsertMeta(store, userId, session, fileName);
    }

    /** 提取消息的纯文本内容用于 token 计算 */
    private getMessageText(msg: ai_agent_message_item): string {
        const parts: string[] = [];
        const content = getContentAsString(msg.content);
        if (content) parts.push(content);
        if (msg.attachments?.length) {
            for (const a of msg.attachments) if (a.content) parts.push(a.content);
        }
        if (msg.tool_calls?.length) {
            for (const tc of msg.tool_calls) if (tc.function?.arguments) parts.push(tc.function.arguments);
        }
        if (msg.tool_call_ends?.length) {
            for (const te of msg.tool_call_ends) parts.push(te.tool_result ?? te.error ?? "");
        }
        if (msg.content_list?.length) {
            for (const c of msg.content_list) parts.push(this.getMessageText(c));
        }
        return parts.join("\n");
    }

    // 为聊天构建新的上下文
    // session.messages 已经在 compressIfNeeded 中被修剪为最新消息，无需再截断
    public build_context_by_session(session:ai_agent_chat_session_item, incoming:ai_agent_message_list, env?: ai_agent_item_dotenv):ai_agent_message_list {
        const context:ai_agent_message_list = [
            {
                role: "system",
                content:
                    `
                    当你需要读取文件内容，而用户的消息中自带附件的时候，优先使用附件的内容，只有需要最新的文件内容的时候，才到本地进行文件搜索。
                  
                    `
            }
        ];
        // 跨会话长期记忆（按周/月/年/永久桶存储）
        const longTermContext = aiAgentLongTermMemoryService.buildContext();
        if (longTermContext) {
            context.push({
                role: "system",
                content: longTermContext
            });
        }

        if (session?.summary || session?.long_term_memory) {
            // 记忆加入
            context.push({
                role: "system",
                content: [
                    session.summary ? `会话压缩摘要：\n${session.summary}` : "",
                    session.long_term_memory ? `长期记忆：\n${session.long_term_memory}` : "",
                    "请把这些记忆当作当前会话上下文；如果用户后续明确纠正，以最新消息为准。如果你要进行一些操作，要以实际的 tools 结果为结果，不能完全依赖记忆中的历史内容。"
                ].filter(Boolean).join("\n\n")
            });
        }
        // 历史消息（已经过压缩，直接使用全部）
        context.push(...(session?.messages ?? []));
        // 新会话内容加入
        context.push(...incoming)
        const new_content:ai_agent_message_list = []
        for (const it of context) {
            llm_render_message(new_content, it, env?.max_tool_content_chars)
        }
        return new_content;
    }

    /** 获取会话的 token 消耗统计 */
    public get_usage_stats(userId: string, sessionId: string): ai_agent_usage_stats | null {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return null;
        const session = this.read_session(userId, meta);
        if (!session) return null;
        return session.usage_stats ?? null;
    }

    private createTitle(text: string) {
        const title = (text ?? "").replace(/\s+/g, " ").trim().slice(0, 28);
        return title || "新会话";
    }

    // 一轮消息回答完，消息数超限则裁剪旧消息，并用 AI 从被裁消息中提取长期记忆
    private async compressIfNeeded(session: ai_agent_chat_session_item, env?: ai_agent_item_dotenv) {
        const messages = session.messages ?? [];
        const compressCount = env?.compress_message_count ?? DEFAULT_COMPRESS_MESSAGE_COUNT;
        const maxRecent = env?.max_recent_messages ?? DEFAULT_MAX_RECENT_MESSAGES;
        if (messages.length <= compressCount) return;

        // 被裁掉的消息
        const dropped = messages.slice(0, messages.length - maxRecent);

        // 保留最近 maxRecent 条
        session.messages = messages.slice(-maxRecent);

        // 从被裁消息中提取长期记忆
        try {
            const extracted = await this.extractLongTermMemory(dropped);
            if (extracted) {
                session.long_term_memory = session.long_term_memory
                    ? this.mergeMemoryText(session.long_term_memory, extracted)
                    : extracted;
            }
        } catch (e) {
            console.error('[长期记忆] 提取失败:', e?.message ?? e);
        }
    }

    /** 合并两段记忆文本，去重行 */
    private mergeMemoryText(a: string, b: string): string {
        const lines = new Set<string>();
        for (const line of (a + '\n' + b).split('\n')) {
            const t = line.trim();
            if (t) lines.add(t);
        }
        return Array.from(lines).join('\n');
    }

    /** 用 AI 从消息中提取长期记忆要点 */
    private async extractLongTermMemory(messages: ai_agent_message_list): Promise<string> {
        if (!messages?.length) return '';
        const cfg = ai_agentService.ai_config;
        if (!cfg) return '';

        // 把消息序列化为纯文本
        const dialog = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => `[${m.role}]: ${getContentAsString(m.content)}`)
            .join('\n');
        if (!dialog.trim()) return '';

        const body: any = {
            model: cfg.model,
            messages: [
                {
                    role: 'system',
                    content:
                        '你是记忆提取器。请从以下对话片段中提取对未来对话有价值的长期记忆。' +
                        '只保留：用户偏好、长期事实、项目约定、重要决定、关键技术决策。' +
                        '每条记忆一行，简洁明了。如果没有值得保留的内容，返回空。' +
                        '只输出纯文本，不要 JSON，不要解释。',
                },
                { role: 'user', content: dialog },
            ],
            temperature: 0.2,
        };

        const res = await llmPost(body, cfg);
        return (await readLlmResponse(res)).trim();
    }

}
export const aiAgentMemoryService = new AiAgentMemoryService();
