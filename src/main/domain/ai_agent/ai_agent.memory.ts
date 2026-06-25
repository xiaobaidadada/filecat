import fs from "fs";
import path from "path";
import fse from "fs-extra";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, data_dir_tem_name} from "../data/data_type";
import {ai_agent_Item} from "../../../common/req/filecat.ai.pojo";
import {ai_config} from "./ai_agent.service";
import {llmPost} from "./llm_request";
import {
    ai_agent_chat_session_item,
    ai_agent_chat_session_meta, ai_agent_message_attachment_item, ai_agent_message_item, ai_agent_messages,
    ai_agent_usage_stats, getContentAsString, getContentLength
} from "../../../common/req/filecat.ai.pojo";

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

// 压缩后仍然完整保留的最近消息数，保证短期上下文不丢失。
const MAX_RECENT_MESSAGES = 24;
// 当单个会话累计消息条数超过该值时，触发历史内容压缩。
const COMPRESS_MESSAGE_COUNT = 36;
// 当单个会话累计消息字符数超过该值时，触发历史内容压缩。
const COMPRESS_CHAR_COUNT = 18000;
// 会话摘要的最大字符数，超过后截断，避免摘要本身无限增长。
const MAX_SUMMARY_CHARS = 6000;
// 长期记忆的最大字符数，超过后保留最新内容，避免长期记忆无限增长。
const MAX_LONG_MEMORY_CHARS = 6000;

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

function normalizeMessage(message: ai_agent_message_item): ai_agent_message_item {
    return {
        ...message,
        role: message.role,
        content: message.content ?? "",
        tool_call_id: message.tool_call_id,
        attachments: (message.attachments ?? []).map(normalizeAttachment),
    };
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

// 格式化 用户消息 把一些json结构化的数据 字符串化
function renderMessageForPrompt(message: ai_agent_message_item): ai_agent_message_item {
    const normalized = normalizeMessage(message);
    if (!normalized.attachments?.length) {
        return normalized;
    }

    const contentStr = getContentAsString(normalized.content);
    return {
        role: normalized.role,
        content: `${normalized.attachments.map(formatAttachment).join("\n")} \n ${contentStr}`.trim(),
        tool_call_id: normalized.tool_call_id
    };
}

function messageChars(messages: ai_agent_messages) {
    return messages.reduce((sum, it) => {
        const attachmentChars = (it.attachments ?? []).reduce((attSum, attachment) => attSum + (attachment.content?.length ?? 0), 0);
        return sum + getContentLength(it.content) + attachmentChars;
    }, 0);
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
            session.messages = (session.messages ?? []).map(normalizeMessage);
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

    private findMetaBySource(userId: string, source: "web" | "cli" | "robot_qq") {
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

    public create_session(userId: string, title = "新会话", source: "web" | "cli" | "robot_qq" = "web",sessionId?:string) {
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

    public ensure_session(userId: string, sessionId?: string, title?: string, source: "web" | "cli" | "robot_qq" = "web") {
        if (sessionId) {
            const session = this.get_session(userId, sessionId);
            if (session) return session;
        }
        return this.create_session(userId, title, source,sessionId);
    }

    public ensure_single_session(userId: string, source: "web" | "cli" | "robot_qq", title: string) {
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

    // 更新消息到会话 整体更新
    public update_messages_to_session(userId: string, sessionId: string, messages: ai_agent_messages) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return;
        const session = this.read_session(userId, meta);
        if (!session) return;
        session.messages = (messages ?? [])
            .filter(it => (it?.content || it?.attachments?.length) && (it.role === "user" || it.role === "assistant"))
            .map(normalizeMessage);
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
    }

    // 将本次机器人的聊天结果加入到历史会话中
    public async appendTurn(userId:string, sessionId:string, userMessage:ai_agent_message_item, assistantMessage:ai_agent_message_item, turnStats?: { output_chars?: number;input_chars?: number; }) {
        const store = this.read_index_of_session();
        const meta = this.user_meta_index_by_store(store, userId).sessions.find(it => it.id === sessionId);
        if (!meta) return;
        const session = this.read_session(userId, meta);
        if (!session) return;
        session.messages = session.messages ?? [];
        session.messages.push(normalizeMessage(userMessage));
        session.messages.push(normalizeMessage(assistantMessage));
        session.updated_at = Date.now();

        // 更新字符消耗统计
        if (!session.usage_stats) {
            session.usage_stats = new ai_agent_usage_stats();
        }
        const stats = session.usage_stats;
        stats.turns = (stats.turns || 0) + 1;
        if (turnStats?.output_chars) {
            stats.output_chars = (stats.output_chars || 0) + turnStats.output_chars;
            stats.recent_output_chars = turnStats.output_chars;
        }
        if (turnStats?.input_chars) {
            stats.input_chars = (stats.input_chars || 0) + turnStats.input_chars;
            stats.recent_input_chars = turnStats.input_chars;
        }

        if (!session.title || session.title === "新会话") {
            session.title = this.createTitle(getContentAsString(userMessage.content));
        }
        await this.compressIfNeeded(session);
        const fileName = this.writeSession(userId, session, meta.file_name);
        this.upsertMeta(store, userId, session, fileName);
    }

    // 为聊天构建新的上下文
    public build_context_by_session(session:ai_agent_chat_session_item, incoming:ai_agent_messages):ai_agent_messages {
        const context:ai_agent_messages = [
            {
                role: "system",
                content:
                    `
                    当你需要读取文件内容，而用户的消息中自带附件的时候，优先使用附件的内容，只有需要最新的文件内容的时候，才到本地进行文件搜索。
                  
                    `
            }
        ];
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
        context.push(...(session?.messages ?? []).slice(-MAX_RECENT_MESSAGES).map(renderMessageForPrompt));
        // 新会话内容加入
        context.push(...incoming.map(renderMessageForPrompt));
        return context;
    }

    /** 获取会话的字符消耗统计 */
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
        if (messages.length <= COMPRESS_MESSAGE_COUNT && messageChars(messages) <= COMPRESS_CHAR_COUNT) {
            // 消息数量  字符数量 都超过了 才进行压缩
            return;
        }
        const oldMessages = messages.slice(0, -MAX_RECENT_MESSAGES);
        const recentMessages = messages.slice(-MAX_RECENT_MESSAGES);
        if (!oldMessages.length) return;

        try {
            const compressed = await this.compressWithAI(session.summary, session.long_term_memory, oldMessages.map(renderMessageForPrompt));
            session.summary = compressed.summary.slice(0, MAX_SUMMARY_CHARS);
            session.long_term_memory = this.mergeMemory(session.long_term_memory, compressed.long_term_memory);
        } catch (e) {
            const text = oldMessages.map(it => `${it.role}: ${renderMessageForPrompt(it).content}`).join("\n").slice(-MAX_SUMMARY_CHARS);
            session.summary = [session.summary, text].filter(Boolean).join("\n").slice(-MAX_SUMMARY_CHARS);
        }
        session.messages = recentMessages;
    }

    private mergeMemory(oldMemory: string, nextMemory: string) {
        const lines = `${oldMemory ?? ""}\n${nextMemory ?? ""}`
            .split("\n")
            .map(it => it.trim())
            .filter(Boolean);
        return Array.from(new Set(lines)).join("\n").slice(-MAX_LONG_MEMORY_CHARS);
    }

    private async compressWithAI(summary: string, longMemory: string, messages: ai_agent_messages, config?: ai_agent_Item): Promise<{ summary: string, long_term_memory: string }> {
        const cfg = config || ai_config;
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
                        const json = JSON.parse(data);
                        text += json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
                    } catch {
                    }
                }
            }
            return text;
        }
        const json = await res.json();
        return json.choices?.[0]?.message?.content ?? "";
    }
}

export const aiAgentMemoryService = new AiAgentMemoryService();
