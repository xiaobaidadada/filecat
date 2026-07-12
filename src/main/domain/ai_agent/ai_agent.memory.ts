import fs from "fs";
import path from "path";
import fse from "fs-extra";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, data_dir_tem_name} from "../data/data_type";
import {ai_agent_Item} from "../../../common/req/filecat.ai.pojo";
import {ai_agentService} from "./ai_agent.service";
import {aiAgentLongTermMemoryService} from "./ai_agent.long_term_memory";
import {llmPost} from "./llm_request";
import {
    ai_agent_chat_session_item,
    ai_agent_chat_session_meta, ai_agent_message_attachment_item, ai_agent_message_item, ai_agent_message_list,
    ai_agent_usage_stats, ai_agent_tool_call_item, getContentAsString, getContentLength,
    ai_long_term_memory_setting,
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

// 以下值的范围符合主流 agent的范围值内
const max_param = 1

// 压缩后仍然完整保留的最近消息数，保证短期上下文不丢失。
const MAX_RECENT_MESSAGES = 24;
// 当单个会话累计消息条数超过该值时，触发历史内容压缩。
// const COMPRESS_MESSAGE_COUNT = 36;
// 当单个会话累计消息 token 数超过该值时，触发历史内容压缩。
const COMPRESS_TOKEN_COUNT = 4500*max_param;  // 约等于 18000 英文字符 ≈ 4500 token
// 会话摘要的最大 token 数，超过后截断，避免摘要本身无限增长。
const MAX_SUMMARY_TOKENS = 1500*max_param;   // 约等于 6000 英文字符
// 长期记忆的最大 token 数，超过后保留最新内容，避免长期记忆无限增长。
const MAX_LONG_MEMORY_TOKENS = 1500*max_param;

// tool工具内容最大长度，只起到展示 让AI知道调用了就行
// const MAX_TOOL_CONTENT_CHARS  = 100;

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

function llm_normalizeMessage(message: ai_agent_message_item) {
    const list:ai_agent_message_item[] = []
    if(message.content_list?.length) {
        for (const it of message.content_list) {
            list.push(...llm_normalizeMessage(it))
        }
        return list;
    }
    const normalized = llm_normalizeMessage_one(message)
    list.push(normalized)
    if(normalized.attachments?.length) {
        return list;
    }
    if(message.tool_call_ends?.length) {
        for (const it of message.tool_call_ends) {
            list.push({
                role: "tool",
                tool_call_id: it.tool_call_id,
                // content: (it.tool_result??it.error??"").slice(0,MAX_TOOL_CONTENT_CHARS)
                content: it.tool_result??it.error??""
            })
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

// 格式化 用户消息 把一些json结构化的数据 字符串化 给 llm 用
function llm_render_message(content:ai_agent_message_list, message: ai_agent_message_item) {
    const normalized = llm_normalizeMessage(message);
    content.push(...normalized)
}

/** 读取消息的 token 数（直接读预计算字段） */
function message_one_tokens(it: ai_agent_message_item): number {
    return it.token_count ?? 0;
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
            }));
    }

    public get_session(userId: string, sessionId: string) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return null;
        const session = this.read_session(userId, meta);
        return session ? cloneSession(session) : null;
    }

    public create_session(userId: string, title = "新会话", source: "web" | "cli" | "robot_qq" | "robot_dingtalk" | "robot_wecom" | "robot_lark" | "robot_wecom" | "robot_lark" = "web",sessionId?:string) {
        const store = this.read_index_of_session();
        const session: ai_agent_chat_session_item = {
            id: sessionId??nowId(),
            title,
            messages: [],
            summary: "",
            long_term_memory: "",
            source,
            created_at: Date.now(),
            updated_at: Date.now()
        };
        const fileName = this.writeSession(userId, session);
        this.upsertMeta(store, userId, session, fileName);
        return cloneSession(session);
    }

    public ensure_session(userId: string, sessionId?: string, title?: string, source: "web" | "cli" | "robot_qq" | "robot_dingtalk" | "robot_wecom" | "robot_lark" | "robot_wecom" | "robot_lark" = "web") {
        if (sessionId) {
            const session = this.get_session(userId, sessionId);
            if (session) return session;
        }
        return this.create_session(userId, title, source,sessionId);
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

    // 将本次机器人的聊天结果加入到历史会话中
    public async appendTurn(userId:string, sessionId:string, userMessage:ai_agent_message_item, assistantMessage:ai_agent_message_item, turnStats?: { output_tokens?: number;input_tokens?: number; }) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return;
        const session = this.read_session(userId, meta);
        if (!session) return;
        session.messages = session.messages ?? [];
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
        await this.compressIfNeeded(session);
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
    public build_context_by_session(session:ai_agent_chat_session_item, incoming:ai_agent_message_list):ai_agent_message_list {
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
        // 历史的最近记忆加入
        context.push(...(session?.messages ?? []).slice(-MAX_RECENT_MESSAGES));
        // 新会话内容加入
        context.push(...incoming)
        const new_content:ai_agent_message_list = []
        for (const it of context) {
            llm_render_message(new_content,it)
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

    // 一轮消息回答完，判断是不是要压缩一下上下文，进行一下总结
    private async compressIfNeeded(session: ai_agent_chat_session_item) {
        const messages = session.messages ?? [];
        let splitIndex = messages.length;
        let tokenSum = 0;
        // 从后往前累加 token，超过 COMPRESS_TOKEN_COUNT 的部分保留为最近消息
        for (let i = messages.length - 1; i >= 0; i--) {
            tokenSum += message_one_tokens(messages[i]);
            if (tokenSum > COMPRESS_TOKEN_COUNT) {
                splitIndex = i + 1;
                break;
            }
        }
        const oldMessages = messages.slice(0, splitIndex);
        const recentMessages = messages.slice(splitIndex);
        // 总 token 未超过阈值则不压缩
        if (tokenSum < COMPRESS_TOKEN_COUNT) {
            return;
        }
        if (!oldMessages.length) return;

        try {
            const compressed = await this.compressWithAI(session.summary, session.long_term_memory, oldMessages.map(llm_normalizeMessage_one));
            session.summary = compressed.summary.slice(0, MAX_SUMMARY_TOKENS);
            session.long_term_memory = await this.mergeMemory(session.long_term_memory, compressed.long_term_memory);
        } catch (e) {
            const text = oldMessages.map(it => `${it.role}: ${llm_normalizeMessage_one(it).content}`).join("\n");
            const estimatedTokens = await estimateTokenCount(text);
            const truncatedText = estimatedTokens > MAX_SUMMARY_TOKENS
                ? text.slice(0, MAX_SUMMARY_TOKENS * 4)
                : text;
            session.summary = [session.summary, truncatedText].filter(Boolean).join("\n");
        }
        session.messages = recentMessages;

        // 将压缩后的 long_term_memory 同步到跨会话长期记忆
        aiAgentLongTermMemoryService.syncMemory(session);
    }

    private async mergeMemory(oldMemory: string, nextMemory: string) {
        const lines = `${oldMemory ?? ""}\n${nextMemory ?? ""}`
            .split("\n")
            .map(it => it.trim())
            .filter(Boolean);
        const joined = Array.from(new Set(lines)).join("\n");
        // 按 token 数截断（通过 tiktoken 精确计算）
        const estimatedTokens = await estimateTokenCount(joined);
        if (estimatedTokens <= MAX_LONG_MEMORY_TOKENS) return joined;
        return joined.slice(0, MAX_LONG_MEMORY_TOKENS * 4);
    }

    private async compressWithAI(summary: string, longMemory: string, messages: ai_agent_message_list, config?: ai_agent_Item): Promise<{ summary: string, long_term_memory: string }> {
        const cfg = config || ai_agentService.ai_config;
        if (!cfg) throw new Error("ai config not found");
        const body: any = {
            model: cfg.model,
            messages: [
                {
                    role: "system",
                    content: "你是会话记忆压缩器。请只输出 JSON，格式为 {\"summary\":\"...\",\"long_term_memory\":\"...\"}。summary 保留任务进展、决定、未完成事项；long_term_memory 只保留跨会话仍有价值的用户偏好、长期事实、项目约定。不要编造。"
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        existing_summary: summary ?? "",
                        existing_long_term_memory: longMemory ?? "",
                        messages
                    })
                }
            ],
            temperature: 0.2
        };
        const res = await llmPost(body, cfg);
        const text = await this.readAiText(res);
        const match = text.match(/\{[\s\S]*\}/);
        const json = JSON.parse(match ? match[0] : text);
        return {
            summary: json.summary ?? "",
            long_term_memory: json.long_term_memory ?? ""
        };
    }

    private async readAiText(res: any) {
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok) {
            throw new Error(await res.text());
        }
        if (contentType.includes("text/event-stream") && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let text = "";
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, {stream: true});
                for (const part of chunk.split("\n")) {
                    const line = part.trim();
                    if (!line.startsWith("data:")) continue;
                    const data = line.slice(5).trim();
                    if (!data || data === "[DONE]") continue;
                    try {
                        const json1 = JSON.parse(data);
                        text += json1.choices?.[0]?.delta?.content ?? json1.choices?.[0]?.message?.content ?? "";
                    } catch {}
                }
            }
            return text;
        }
        const json2 = await res.json();
        return json2.choices?.[0]?.message?.content ?? "";
    }

}
export const aiAgentMemoryService = new AiAgentMemoryService();
