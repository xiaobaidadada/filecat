import {AiToolItem} from "../../../plugin";
import {Response} from "express";
import {Readable} from "stream";
import os from "os";
import {Ai_agentTools, Ai_agentTools_type, tools_des_map} from "./tools/ai_agent.tools";
import {settingService} from "../setting/setting.service";
import {ai_agentMcpService} from "./ai_agent.mcp";
import path from "path";
import {userService} from "../user/user.service";
import {exec_type} from "pty-shell";
import {shellServiceImpl} from "../shell/shell.service";
import {UserAuth, UserData} from "../../../common/req/user.req";
import {Env} from "../../../common/node/Env";
import {FileUtil} from "../file/FileUtil";
import {matchGitignore} from "../../../common/StringUtil";
import {formatDuration, formatFileSize} from "../../../common/ValueUtil";
import {AsyncPool} from "../../../common/ListUtil";
import {Wss} from "../../../common/frame/ws.server";
import {CmdType} from "../../../common/frame/WsData";
import {isAbsolutePath} from "../../../common/path_util";
import {CommonUtil} from "../../../common/common.util";
import {start_worker_threads, ThreadsFilecat} from "../../threads/filecat/threads.filecat";
import {threads_msg_type} from "../../threads/threads.type";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, data_dir_tem_name, file_key} from "../data/data_type";
import {pinyin} from "pinyin-pro";
import {hash_str_to_number} from "../../../common/node/value.util";
import {ServerEvent} from "../../other/config";
import {chat_core} from "./chat.core";
import {download_ripgrep} from "../bin/download-ripgrep";
import {aiAgentMemoryService} from "./ai_agent.memory";
import {
    ai_agent_content,
    ai_agent_Item,
    ai_agent_item_dotenv, ai_agent_message_attachment_item, ai_agent_message_item, ai_agent_messages,
    ai_agent_option_item_extra,
    ai_docs_item,
    ai_docs_load_info,
    ai_docs_setting_param,
    getContentAsString
} from "../../../common/req/filecat.ai.pojo";
import {llmAudioSpeech, llmEmbeddings, llmImagesGenerate, llmPost} from "./llm_request";
import {ai_agent_params_type} from "./tools/ai_agent.constant";
import {robotService} from "./api_robot/robotService";
import {wss_interface} from "../../../common/frame/type";
import {exec_cmd_background_tool} from "./tools/exec_cmd_background";
import {list_background_processes_tool} from "./tools/list_background_processes";
import {get_background_process_output_tool} from "./tools/get_background_process_output";

const {
    cut,
    cut_all,
    cut_for_search,
    tokenize,
    add_word,
} = require("jieba-wasm");

// export let API_KEY = process.env.AI_API_KEY;
// export let BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
// export let MODEL = "doubao-seed-1-6";
// export let ai_config: ai_agent_Item
// export let ai_config_env = new ai_agent_item_dotenv()
export let ai_config_search_doc = new ai_docs_setting_param()

/** 注册为 tool 的 model 配置列表 */
export let ai_tool_models: ai_agent_Item[] = [];

// 判断是否中文
function isChinese(str: string) {
    return /[\u4e00-\u9fa5]/.test(str);
}

function formatAttachmentTitle(attachments?: ai_agent_message_attachment_item[]) {
    if (!attachments?.length) return "";
    return attachments.map(it => it.name).filter(Boolean).slice(0, 3).join(", ");
}

/**
 * 边输出部分结果，边进行工具调用，这是怎么做到的
 */
export class Ai_agentService {

    docs_data_map: Map<number, {
        // path?: string,
        // path_hash:number;
        // content:string,
        // file_name?: string
        time_stamp: number
    }> = new Map()
    docs_info = new ai_docs_load_info()
    public all_wss_set = new Set<Wss>;

    public ai_config: ai_agent_Item
    public ai_config_env = new ai_agent_item_dotenv()


    public async search_docs({keywords}: { keywords: string[] }) {
        const scoreMap = new Map<string, number>();
        const new_keywords:any = {}
        for (const k of keywords) {
            if (!k) continue;
            // 原文关键词
            new_keywords[k] = 1;
            if (isChinese(k)) {
                // 分词后的关键词
                for (const k2 of cut_for_search(k, true)) {
                    if (k2) new_keywords[k2] = 1;
                }
                // 中文转拼音全拼（无声调）
                const pyFull = pinyin(k, {toneType: "none"});
                if (pyFull) {
                    // new_keywords[pyFull] = 1;
                    new_keywords[pyFull.replace(/\s+/g, "")] = 1;
                }
            } else {
                // 拼音转汉字不行
            }
        }
        let keys = [...new Set(
            Object.keys(new_keywords)
                .map(k => k.toLowerCase().trim())
                .filter(Boolean)
        )];
        // 合并成一个查询
        keys = [keys.join(" ")]
        // if(keys.length > 1) {
        //     keys.push(keywords.join(" "))
        // }
        const r_list = await Promise.all(
            keys.map(k =>
                ThreadsFilecat.post(threads_msg_type.docs_search, {key: k}, 60000)
            )
        );
        for (let i = 0; i < r_list.length; i++) {
            const {ids, names_ids} = r_list[i];
            let extra_weight = 0
            // if (r_list.length > 1 && r_list.length -1 === i) {
            //     extra_weight += 2
            // }
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                const weight = 1 / (i + 1) + extra_weight;
                scoreMap.set(id, (scoreMap.get(id) || 0) + weight);
            }
            for (let i = 0; i < names_ids.length; i++) {
                const id = names_ids[i];
                const weight = 1 / (i + 1) + extra_weight + 0.5; // 名字比内容的匹配度更重要一点
                scoreMap.set(id, (scoreMap.get(id) || 0) + weight);
            }
        }
        const sorted = [...scoreMap.entries()]
            .sort((a, b) => b[1] - a[1]) // 从大到小排序 按得分排序
            .map(([id]) => id); // 只保留 key也就是id
        const results: {
            file_name: string,
            content: string
        }[] = []
        let total_char_num = 0
        for (const id of sorted) {
            if (total_char_num >= ai_config_search_doc.docs_max_char_num) {
                break;
            }
            // const hash_id = hash_str_to_number(id)
            // const file = this.docs_data_map.get(hash_id)
            const content = (await FileUtil.readFileSync(id)).toString()
            results.push({
                file_name: id,
                content
            })
            total_char_num += content.length
        }
        return `知识库搜索结果 ${JSON.stringify({
            results
        })}`;
    }

    private init_search_docs_param() {
        // if (!this.docs_switch_get()) return;
        const setting = settingService.ai_docs_setting()
        Env.load(setting.param, ai_config_search_doc);
        // console.log(`ai知识库参数`, JSON.stringify(config_search_doc))
    }

    async load_one_file(token: string, param_path: string) {
        if (!this.docs_switch_get()) return;
        const root_path = settingService.getFileRootPath(token);
        let sysPath = decodeURIComponent(param_path)
        if (isAbsolutePath(sysPath)) {

        } else {
            sysPath = path.join(root_path, sysPath);
        }
        userService.check_user_path(token, sysPath)
        await this.load_search_docs([{
            auto_load: true,
            dir: sysPath
        }])
    }

    private async add_content(file_path: string) {
        return  ThreadsFilecat.post(threads_msg_type.docs_add, {
            use_zh_segmentation:
            ai_config_search_doc.use_zh_segmentation
            , file_path,
            mtime: this.docs_data_map.get(hash_str_to_number(file_path))?.time_stamp
        }, 60 * 1000)
    }

    private async remove_content(file_path: string) {
        await ThreadsFilecat.post(threads_msg_type.docs_del, {
            file_path
        }, 60 * 1000)
        this.docs_data_map.delete(hash_str_to_number(file_path));
    }

    public async close_index() {
        this.running_num++;
        if(ThreadsFilecat.is_running)
            await ThreadsFilecat.post(threads_msg_type.docs_close, {}, 60 * 1000)
        ai_agentService.docs_data_map.clear()
        await ThreadsFilecat.close()
        this.docs_info.init_statics(0)
    }

    running_num = 1 // 用于终止 正在 加载文件的函数

    private push_wss(now: number) {
        this.docs_info.consume_time_ms_len = Date.now() - now
        this.docs_info.total_num = this.docs_data_map.size
        Wss.sendToAllClient(CmdType.ai_load_info, this.docs_info, this.all_wss_set)
    }

    async init() {
        this.load_key()
        if(process.env.run_env !== "exe") {
            if(ai_agentService.have_ai_open()) {
                download_ripgrep().then(r => {

                }).catch(console.error);
            }
        }
        await ThreadsFilecat.close()
        this.init_search_docs_param()
        await ai_agentMcpService.reload().catch(console.error);
        // 启动机器人服务
        await this.reloadRobots().catch(console.error);
        if (!this.docs_switch_get()) return;
        start_worker_threads()
        const body:any = {index_storage_type: ai_config_search_doc.index_storage_type}
        if (ai_config_search_doc.index_storage_type === 'sqlite') {
            body['db_path'] = DataUtil.get_file_path(data_dir_tem_name.sys_database_dir, file_key.fts5_rag_db)
        }
        await ThreadsFilecat.post(threads_msg_type.docs_init, body, 60 * 1000)
        this.load_search_docs().catch(console.error);
    }

    // 加载文件 进入索引
    private async load_search_docs(target_list?: ai_docs_item[]) {
        if (!this.docs_switch_get()) return;
        const now = Date.now();

        // const is_one_load = target_list != null;
        this.docs_info.init_statics(0)

        this.push_wss(now)

        const dir_recursion_depth = ai_config_search_doc.dir_recursion_depth
        const list = target_list || settingService.ai_docs_setting().list;
        if (!list?.length) {
            // if(ThreadsFilecat.is_running) {
            //     await ThreadsFilecat.forceTerminateAll()
            // }
            return;
        }

        // 可以正式开始了
        let running_num = this.running_num


        // 特殊路径判断
        let ignore_list: string[] = []
        let allow_list: string[] = []
        // let ignore_list_str = []
        if (ai_config_search_doc.ignore_dir) {
            if (typeof ai_config_search_doc.ignore_dir === 'string') {
                ignore_list.push(ai_config_search_doc.ignore_dir);
            } else {
                if (Array.isArray(ai_config_search_doc.ignore_dir)) {
                    ignore_list = ai_config_search_doc.ignore_dir
                }
            }
        }
        if (ai_config_search_doc.allow_file_path) {
            if (typeof ai_config_search_doc.allow_file_path === 'string') {
                allow_list.push(ai_config_search_doc.allow_file_path);
            } else {
                if (Array.isArray(ai_config_search_doc.allow_file_path)) {
                    allow_list = ai_config_search_doc.allow_file_path
                }
            }
        }


        const files_set = new Set<number>();
        let update_file_num = 0
        let await_file_total = ai_config_search_doc.await_file_num ?? 0;
        // let file_char_num = 0
        const add_file_path_list: string[] = []
        const update_file_path_list: string[] = []
        // const delete_file_path_list: string[] = []
        // 处理单个文件
        const handleFile = async (file_path: string, file_name: string) => {
            if (files_set.size >= ai_config_search_doc.max_file_num) {
                return;
            }
            if (running_num != this.running_num) return;
            if (ai_config_search_doc.allow_file_path) {
                let ok = false
                for (const allow of allow_list) {
                    if (matchGitignore(file_path, allow)) {
                        ok = true
                        break
                    }
                }
                if (!ok) return
            }
            if (await_file_total <= 0) {
                await_file_total = ai_config_search_doc.await_file_num ?? 0;
                if (ai_config_search_doc.await_time_ms_len) {
                    await CommonUtil.sleep(ai_config_search_doc.await_time_ms_len);
                }
            } else {
                await_file_total--
            }
            const file_stats = await FileUtil.statSync(file_path);
            if (!file_stats.isFile()) return;
            if (file_stats.size > ai_config_search_doc.max_file_byte_size) {
                return;
            }
            this.docs_info.size += file_stats.size;
            const hash_id = hash_str_to_number(file_path);
            if (this.docs_data_map.has(hash_id)) {
                const it = this.docs_data_map.get(hash_id)!;
                const mtime = file_stats.mtime.getTime();

                if (it.time_stamp === mtime) {
                    // 文件没变，跳过
                } else {
                    it.time_stamp = mtime;
                    update_file_path_list.push(file_path);
                    update_file_num++
                }
            } else {
                add_file_path_list.push(file_path);
                this.docs_data_map.set(hash_id, {
                    // file_name,
                    time_stamp: file_stats.mtime.getTime(),
                    // path: file_path,
                });
                update_file_num++
            }
            this.docs_info.num++
            files_set.add(hash_id);
        };
        const async_poll = new AsyncPool(ai_config_search_doc.max_file_concurrency)


        // 递归遍历目录
        // 递归遍历目录（带深度控制）
        const walkDir = async (dir: string, depth: number) => {
            // 超过最大递归深度，直接返回
            if (depth > dir_recursion_depth) {
                return;
            }
            if (running_num != this.running_num) return;
            const stat = await FileUtil.statSync(dir);
            if (stat.isFile()) {
                await async_poll.run(() => handleFile(dir, path.basename(dir)));
                return;
            }
            const entries = await FileUtil.readdirSync(dir);

            for (const entry of entries) {
                if (files_set.size >= ai_config_search_doc.max_file_num) {
                    return;
                }
                const fullPath = path.join(dir, entry);
                let ok = false;
                for (const ignore of ignore_list) {
                    if (matchGitignore(entry, ignore)) {
                        ok = true;
                        // ignore_list_str.push(entry);
                        break;
                    }
                }
                if (ok) continue;
                const stat = await FileUtil.statSync(fullPath);

                if (stat.isDirectory()) {
                    // 只有在没超过深度时才递归
                    if (depth < dir_recursion_depth) {
                        await walkDir(fullPath, depth + 1);
                    }
                } else if (stat.isFile()) {
                    await async_poll.run(() => handleFile(fullPath, entry));
                }
            }
            this.push_wss(now)
        };


        const total = list.length;
        // 扫描配置中的目录
        for (let i = 0; i < list.length; i++) {
            const it = list[i];
            if (it.auto_load) {
                await walkDir(it.dir, 0);
            }
        }


        const totalFiles = add_file_path_list.length + update_file_path_list.length
        let processed = 0;
        for (const file_path of add_file_path_list) {
            this.docs_info.char_num += (await this.add_content(file_path))?.char_num??0;
            processed++;
            this.docs_info.progress = ((processed / totalFiles) * 100).toFixed(2);
            this.push_wss(now)
        }
        for (const file_path of update_file_path_list) {
            await this.remove_content(file_path);
            this.docs_info.char_num += (await this.add_content(file_path))?.char_num??0;
            processed++;
            this.docs_info.progress = ((processed / totalFiles) * 100).toFixed(2);
            this.push_wss(now)
        }

        // for (const file_path of delete_file_path_list) {
        //     await this.remove_content(file_path)
        //     processed++;
        //     this.docs_info.progress = ((processed / totalFiles) * 100).toFixed(2);
        //     this.push_wss(now)
        // }
        this.docs_info.progress = 100
        // 删除已经不存在的文件
        this.push_wss(now)

        console.log(`共扫描了 ${files_set.size} 个知识库文件`)
        console.log(`共更新了 ${update_file_num} 个知识库文件`)
        console.log(`知识库总字符数量 ${this.docs_info.char_num} `);
        console.log(`知识库总文件大小 ${formatFileSize(this.docs_info.size)} `);
        console.log(`加载总耗时 ${formatDuration(this.docs_info.consume_time_ms_len)}`)

        // console.log(`忽略了以下文件 ${ignore_list_str.length} ${JSON.stringify(ignore_list_str)}`);
    }


    public async delete_index_with_progress(targetPath: string) {
        // 先收集要删除的所有文件
        this.docs_info.init_statics(0)
        const filesToDelete: string[] = [];
        const now = Date.now();
        const collectFiles = async (p: string) => {
            const stat = await FileUtil.statSync(p);
            if (!stat) return;
            if (stat.isFile()) {
                if (this.docs_data_map.has(hash_str_to_number(p))) {
                    filesToDelete.push(p);
                    this.docs_info.size += stat.size;
                    this.docs_info.num++;
                }
            } else if (stat.isDirectory()) {
                const entries = await FileUtil.readdirSync(p);
                for (const entry of entries) {
                    await collectFiles(path.join(p, entry));
                }
            }
        };

        await collectFiles(targetPath);
        const totalFiles = filesToDelete.length;
        let processed = 0;
        for (const filePath of filesToDelete) {
            await this.remove_content(filePath);
            processed++;
            this.docs_info.progress = ((processed / totalFiles) * 100).toFixed(2);
            this.push_wss(now);
        }
        this.docs_info.progress = 100;
        this.push_wss(now);
    }

    get_env() {
        return {
            ai_config_env:ai_agentService.ai_config_env,
            ai_config:ai_agentService.ai_config
        };
    }

    // 只要开启了任意一个ai
    // public have_ai_is_open = false

    docs_switch_get( ) {
        let status:boolean =  DataUtil.get(data_common_key.ai_agent_status)
        if(status == null) {
            status = false
        }
        return status;
    }

    public have_ai_open() {
        const r = settingService.ai_agent_setting()
        for (const it of r.models) {
            if (it.open) {
                return true;
            }
        }
        return false;
    }

    /**
     * 设置指定模型为当前激活模型（将其 open 设为 true，其他设为 false）
     * @param modelName 模型的 note 或 model 字段值，用于查找
     */
    public set_active_model(modelName: string) {
        const body =  settingService.ai_agent_setting()
        if (!body?.models?.length) return;
        let found = false;
        for (const m of body.models) {
            if(m.open) {
                found = true;
                m.model = modelName;
                break
            }
        }
        if (!found) return;
        DataUtil.set(data_common_key.ai_agent_model_setting, body);
        this.load_key();
    }

    public ai_agent_setting_save(body:any) {
        DataUtil.set(data_common_key.ai_agent_model_setting,body)
        const list = settingService.ai_agent_setting()
        for (const p of list.models) {
            const pojo:ai_agent_option_item_extra = {}
            Env.load(p.dotenv,pojo)
            if(pojo.options_agent_model_list || pojo.options_agent_key_list || pojo.options_agent_url_list) {
                if(p.show_options == null) {
                    p.show_options = {}
                }
                p.show_options.options_agent_model_list = pojo.options_agent_model_list
                p.show_options.options_agent_key_list = pojo.options_agent_key_list
                p.show_options.options_agent_url_list = pojo.options_agent_url_list
            } else {
                delete p.show_options
            }
        }
        this.load_key()
    }

    public load_key() {
        this.ai_config_env = new ai_agent_item_dotenv()
        // this.have_ai_is_open = false
        const r = settingService.ai_agent_setting()
        ai_tool_models = []; // 重置
        let have_open = false
        for (const it of r.models) {
            if (it.tool_mode) {
                ai_tool_models.push(it);
            }
            if (it.open) {
                // MODEL = it.model
                // BASE_URL = it.url
                // API_KEY = it.token
                this.ai_config = it
                if (it.dotenv) {
                    Env.load(it.dotenv, this.ai_config_env);
                }
                have_open = true
                // this.have_ai_is_open = true
                // 不 return，继续收集所有 tool 模型
            }
        }
        if(have_open === false) {
            this.ai_config = undefined
        }
        // API_KEY = undefined
        // BASE_URL = undefined
        // MODEL = undefined
    }



    // is_use_local_data() {
    //     return this.docs_data_map.size > 0
    // }


    // ============ WebSocket 聊天方法（替代 SSE） ============

    /** 存储活跃的 AI 聊天 AbortController，key 为 session_id，用于支持客户端取消 */
    public activeChatControllers = new Map<string, AbortController>();

    /**
     * 通过 WebSocket 进行 AI 聊天（替代 SSE 的 /chat 接口）
     * 
     * 流程：
     * 1. 客户端发送 ai_chat_req，服务端收到后调用此方法
     * 2. 服务端通过 ai_chat_msg 推送 AI 流式回复片段
     * 3. 服务端通过 ai_chat_end 推送结束信息（含 meta）
     * 4. 如果出错，服务端通过 ai_chat_error 推送错误
     * 5. 客户端可发送 ai_chat_abort 取消正在进行的聊天
     * 
     * @param originMessages - 原始消息列表
     * @param token - 用户 token
     * @param wss - WebSocket 连接对象（用于向该客户端推送消息）
     * @param session_id - 可选的会话 ID
     * @param sys_prompt - 可选的系统提示词
     */
    public async chat_ws(
        originMessages: ai_agent_messages,
        token: string,
        wss: Wss,
        session_id?: string,
        sys_prompt?: string,
    ) {
        const controller = new AbortController();
        let chatFinished = false;

        // 注册 AbortController，以便客户端通过 ai_chat_abort 取消
        if (session_id) {
            // 如果同一个 session 已有活跃的聊天，先取消旧的
            const oldController = this.activeChatControllers.get(session_id);
            if (oldController) {
                oldController.abort();
            }
            this.activeChatControllers.set(session_id, controller);
        }

        // 客户端断开时，自动取消
        wss.setClose(() => {
            if (!chatFinished) {
                controller.abort();
                if (session_id) {
                    this.activeChatControllers.delete(session_id);
                }
            }
        });

        const userId = userService.get_user_info_by_token(token).id;
        const incomingMessages = (originMessages ?? []).filter(it => it && (it.content || it.attachments?.length));
        const latestUserMessage = [...incomingMessages].reverse().find(it => it.role === "user") ?? incomingMessages[incomingMessages.length - 1];
        const sessionTitle = getContentAsString(latestUserMessage?.content)?.trim()
            || formatAttachmentTitle(latestUserMessage?.attachments)
            || "新会话";
        const session = aiAgentMemoryService.ensure_session(userId, session_id, sessionTitle);
        const workMessages = aiAgentMemoryService.build_context_by_session(session, incomingMessages);
        let turnInputChars = 0;
        let turnOutputChars = 0;

        try {
            const tools = ai_agentService.getModelToolSchemas();

            await chat_core.chat({
                wss,
                tools,
                originMessages: workMessages,
                user_id: userId,
                controller,
                session_id: session_id || session.id,
                // ===== 流式推送：每个文本片段通过 ai_chat_msg 推送给客户端，携带分块序号和消息类型 =====
                on_msg: (payload) => {
                    wss.send(CmdType.ai_chat_msg, {
                        text: payload.text,
                        chunk_index: payload.chunk_index,
                        tool_call_ends:payload.tool_call_ends
                    });
                },
                // ===== 结束推送：发送 ai_chat_end 含 meta 信息 =====
                on_end: (stats) => {
                    chatFinished = true;
                    if (session_id) {
                        this.activeChatControllers.delete(session_id);
                    }
                    if (stats) {
                        turnInputChars = stats.input_chars;
                        turnOutputChars = stats.output_chars;
                    }
                    wss.send(CmdType.ai_chat_end, {
                    });
                    // 保存会话记录
                    const assistantText = (stats?.once_messages_list ?? [])
                        .map(it => getContentAsString(it.content))
                        .filter(Boolean)
                        .join("\n\n");
                    const assistantMessage: ai_agent_message_item = {
                        role: "assistant",
                        content: assistantText,
                        content_list: stats?.once_messages_list ?? [],
                    };
                    aiAgentMemoryService.appendTurn(userId, session.id, latestUserMessage, assistantMessage, {
                        input_chars: turnInputChars,
                        output_chars: turnOutputChars,
                    }).catch(console.error);
                },
                token,
                sys_prompt,
            });

        } catch (error: any) {
            chatFinished = true;
            if (session_id) {
                this.activeChatControllers.delete(session_id);
            }
            const errorMsg = error?.message ?? JSON.stringify(error);
            wss.send(CmdType.ai_chat_error, { message: errorMsg });
            // 保存错误到会话
            try {
                const userMsg: ai_agent_message_item = {
                    role: "user",
                    content: latestUserMessage?.content ?? "",
                };
                const errMsg: ai_agent_message_item = {
                    role: "assistant",
                    content: errorMsg,
                };
                await aiAgentMemoryService.appendTurn(userId, session.id, userMsg, errMsg, {
                    input_chars: getContentAsString(userMsg.content).length,
                    output_chars: errorMsg.length,
                });
            } catch (e) {
                console.error("保存错误会话失败", e);
            }
        }
    }


    public async reloadMcp() {
        await ai_agentMcpService.reload();
    }

    public async reloadRobots() {
        await robotService.reload();
    }

    public getMcpTools() {
        return ai_agentMcpService.getTools();
    }

    public async getMcpServerTools() {
        return ai_agentMcpService.getServerToolGroups();
    }

    public async reloadMcpServer(index: number) {
        return ai_agentMcpService.reloadServer(index);
    }

    // ============ Model Tool 管理 ============

    /**
     * 获取所有 tool_mode 的 model 的 schema 列表（用于向 LLM 注册为 tools）
     */
    public getModelToolSchemas(): ai_agent_params_type[] {
        const schemas: ai_agent_params_type[] = [];
        for (const model of ai_tool_models) {
            const name = `call_model_${model.index ?? 0}`;
            const displayName = model.note || model.model || `model-${model.index}`;
            const requestType = model.request_type || 'completions';

            // 根据 request_type 生成能力描述
            const abilityMap: Record<string, string> = {
                'completions': '对话/文本生成/推理/代码/分析',
                'images': '图片生成（根据文字描述生成图片）',
                'embeddings': '向量嵌入（将文本转换为向量）',
                'audio_speech': '文本转语音（将文字转为音频）',
                'audio_transcription': '语音转文字',
                'audio_translation': '语音翻译',
            };
            const abilityDesc = abilityMap[requestType] || requestType;

            schemas.push({
                type: "function",
                function: {
                    name,
                    description: `调用另一个 AI 模型（${displayName}）来处理任务。该模型的能力类型为「${abilityDesc}」。适用于当前模型不擅长或需要不同能力的场景。把任务描述清楚，该模型会独立处理并返回结果。${model.sys_prompt??''}`,
                    parameters: {
                        type: "object",
                        properties: {
                            prompt: {
                                type: "string",
                                description: `发送给模型 "${displayName}" 的完整提示词/指令（${abilityDesc}），要清晰描述任务目标、上下文和期望的输出格式。`
                            }
                        },
                        required: ["prompt"]
                    }
                }
            });
        }
        return schemas;
    }

    /**
     * 调用一个注册为 tool 的模型
     * 支持多种请求类型：
     * - completions（对话）：再次调用 chat_core.chat 获得完整功能链（工具调用、流式、权限检查等）
     * - images（图片生成）：直接请求 images/generations 接口
     * - embeddings（向量）：直接请求 embeddings 接口
     * - audio_speech（语音合成）：直接请求 audio/speech 接口
     * - audio_transcription / audio_translation：直接请求对应接口
     */
    public async callModelTool(toolName: string, args: { prompt: string },user_id:string, session_id?:string, wss?:wss_interface): Promise<string> {
        const index = parseInt(toolName.replace('call_model_', ''), 10);
        const modelItem = ai_tool_models.find(m => m.index === index);
        if (!modelItem) {
            throw new Error(`未找到 index=${index} 的 model tool 配置`);
        }

        // 为目标模型构建独立的 env 配置（不修改全局变量）
        const modelEnv = new ai_agent_item_dotenv();
        if (modelItem.dotenv) {
            Env.load(modelItem.dotenv, modelEnv);
        }

        const requestType = modelItem.request_type || 'completions';

        // ====== 根据 request_type 分发，直接传入 config 和 env ======
        switch (requestType) {
            case 'completions': {
                // 对话类型：调用 chat_core.chat 获得完整功能链
                return await this.callModelToolAsChat(modelItem, modelEnv, args.prompt,user_id, session_id, wss);
            }

            case 'images': {
                // 图片生成
                const res = await llmImagesGenerate({prompt: args.prompt}, modelItem, modelEnv);
                const result = await res.json();
                const images = (result?.data ?? []).map((img: any) =>
                    `![生成图片](${img.url || `data:image/png;base64,${img.b64_json}`})${img.revised_prompt ? `\n> ${img.revised_prompt}` : ''}`
                );
                return images.join('\n\n') || `生成了 ${(result?.data ?? []).length} 张图片`;
            }

            case 'embeddings': {
                // 向量嵌入
                const res = await llmEmbeddings({input: args.prompt}, modelItem, modelEnv);
                const result = await res.json();
                const data = result?.data ?? [];
                const dims = data[0]?.embedding?.length ?? 0;
                return `✅ Embeddings 结果 - 向量维度: ${dims}, 数量: ${data.length}\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 3000)}\n\`\`\``;
            }

            case 'audio_speech': {
                // 文本转语音
                const res = await llmAudioSpeech({input: args.prompt}, modelItem, modelEnv);
                const arrayBuffer = await res.arrayBuffer();
                const audioBuffer = Buffer.from(arrayBuffer);
                const base64Audio = audioBuffer.toString('base64');
                const mimeType = res.headers.get("content-type") || "audio/mpeg";
                return `[音频文件: ${args.prompt.slice(0, 50)}...]\n\`audio: data:${mimeType};base64,${base64Audio.slice(0, 100)}...[已截断]\``;
            }

            case 'audio_transcription':
            case 'audio_translation': {
                // 语音转录/翻译 — 直接走原始 llmPost 非流式请求
                return await this.callModelToolRaw(modelItem, modelEnv, args.prompt);
            }

            default: {
                // 兜底：走原始非流式请求
                return await this.callModelToolRaw(modelItem, modelEnv, args.prompt);
            }
        }
    }

    /**
     * 以对话方式调用目标模型，再次使用 chat_core.chat 获得完整功能链
     */
    private async callModelToolAsChat(modelItem: ai_agent_Item, modelEnv: ai_agent_item_dotenv, prompt: string,user_id:string, session_id?:string, wss?:wss_interface): Promise<string> {

        let fullContent = "";
        const controller = new AbortController();

        await chat_core.chat({
            wss,
            originMessages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            user_id: user_id,
            controller,
            on_msg: (payload) => {
                fullContent += payload.text;
            },
            on_end: () => {},
            sys_prompt: `你是一个独立的 AI 模型（${modelItem.note || modelItem.model}），请根据用户的要求完成任务并返回结果。${modelItem.sys_prompt ?? ''}`,
            aiConfig: modelItem,
            aiEnv: modelEnv,
            session_id: session_id,
        });

        return fullContent || "模型未返回内容";
    }

    /**
     * 以原始非流式方式调用目标模型（用于非对话类型的兜底请求）
     */
    private async callModelToolRaw(modelItem: ai_agent_Item, modelEnv: ai_agent_item_dotenv, prompt: string): Promise<string> {
        const json_body: any = {
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: modelItem.model,
        };

        // 合并自定义参数
        try {
            if (modelItem.json_params) {
                const obj = JSON.parse(modelItem.json_params);
                // 非流式请求，去掉 stream
                delete obj.stream;
                Object.assign(json_body, obj);
            }
        } catch (err) {
            console.error("解析 model tool json_params 失败", err);
        }

        const res = await llmPost(json_body, modelItem, modelEnv);

        if (!res.ok) {
            const text = await res.text();
            try {
                const json = JSON.parse(text);
                throw new Error(json.message || json.error?.message || text);
            } catch {
                throw new Error(text);
            }
        }

        const resultText = await res.text();
        const result = JSON.parse(resultText);
        const content = result.choices?.[0]?.message?.content ?? "";
        return content || "模型未返回内容";
    }

    /**
     * 判断某个 toolName 是否是 model tool
     */
    public isModelTool(toolName: string): boolean {
        return toolName.startsWith('call_model_');
    }

    // ============ AI 命令确认管理 ============

    /**
     * 待用户确认的命令映射
     * key: askId
     * value: { user_id, cmd, createdAt, resolve, timeout }
     */
    public pendingConfirmMap = new Map<string, {
        user_id: string;
        cmd: string;
        createdAt: number;
        resolve: (approved: boolean) => void;
        timeout: any;
        /** 发起确认请求的 wss 连接（通过 wss.token 可以找到同一用户的所有标签页） */
        wss?: wss_interface;
    }>();

    // ============ 插件工具管理 ============

    /**
     * 插件工具注册表
     * key: 插件 id
     * value: 该插件注册的工具列表
     */
    private pluginToolsMap: Map<string, AiToolItem[]> = new Map();

    /**
     * 注册插件工具
     */
    public registerPluginTool(pluginId: string, tool: AiToolItem) {
        if (!this.pluginToolsMap.has(pluginId)) {
            this.pluginToolsMap.set(pluginId, []);
        }
        this.pluginToolsMap.get(pluginId)!.push(tool);
    }

    /**
     * 注销某个插件的所有工具
     */
    public unregisterPluginTools(pluginId: string) {
        this.pluginToolsMap.delete(pluginId);
    }

    /**
     * 获取插件工具 schema 列表（用于向 LLM 注册）
     */
    public getPluginToolSchemas(): ai_agent_params_type[] {
        const schemas: ai_agent_params_type[] = [];
        for (const [pluginId, tools] of this.pluginToolsMap) {
            for (const tool of tools) {
                schemas.push(tool.schema);
            }
        }
        return schemas;
    }


    /**
     * 获取插件工具的 handler
     */
    private getPluginToolHandler(toolName: string): ((args: any) => Promise<string | object>) | undefined {
        for (const [pluginId, tools] of this.pluginToolsMap) {
            const tool = tools.find(t => t.schema.function.name === toolName);
            if (tool) {
                return tool.handler;
            }
        }
        return undefined;
    }

    // =====================================

    public getToolInfo(toolName: string, args: any) {
        // model tool
        if (this.isModelTool(toolName)) {
            const index = parseInt(toolName.replace('call_model_', ''), 10);
            const modelItem = ai_tool_models.find(m => m.index === index);
            const displayName = modelItem?.note || modelItem?.model || toolName;
            return {
                get_name: () => displayName,
                get_params: () => args?.prompt ? `"${args.prompt?.slice(0, 50)}..."` : ""
            };
        }
        if (Ai_agentTools[toolName as Ai_agentTools_type]) {
            return {
                get_name: () => tools_des_map[toolName as Ai_agentTools_type]?.get_name?.() ?? toolName,
                get_params: () => tools_des_map[toolName as Ai_agentTools_type]?.get_params?.(args) ?? ""
            };
        }
        return ai_agentMcpService.getToolInfo(toolName, args);
    }

    public async callTool(toolName: string, args: any,user_id:string, session_id?:string, wss?:wss_interface) {
        // model tool（调用其他注册为 tool 的 AI 模型）
        if (this.isModelTool(toolName)) {
            return this.callModelTool(toolName, args,user_id, session_id, wss);
        }
        // 内置工具 — 后台进程相关工具需要 session_id
        if (toolName === "exec_cmd_background") {
            return exec_cmd_background_tool(args, session_id);
        }
        if (toolName === "list_background_processes") {
            return list_background_processes_tool(session_id);
        }
        if (toolName === "get_background_process_output") {
            return get_background_process_output_tool(args);
        }
        // 其他内置
        if (Ai_agentTools[toolName as Ai_agentTools_type]) {
            return Ai_agentTools[toolName as Ai_agentTools_type](args);
        }
        // 检查是否是插件工具
        const pluginHandler = this.getPluginToolHandler(toolName);
        if (pluginHandler) {
            return pluginHandler(args);
        }
        return ai_agentMcpService.callTool(toolName, args);
    }


    public write_to_res(res: Response, text: string) {
        const data = `event: message\ndata: ${JSON.stringify(text)}\n\n`;

        // 1. 写入 Response 缓冲区
        const flushed = res.write(data);

        // 2. 强制 Socket 刷新
        const socket = (res as any).socket;
        if (socket) {
            // 禁用 Nagle 算法，禁止数据包堆积
            socket.setNoDelay(true);

            // 如果底层支持 flush（某些 Node 版本或代理库），则调用
            if (typeof (res as any).flush === 'function') {
                (res as any).flush();
            }
        }
        // console.log("已尝试发送数据，res.write 返回:", flushed);
    }

    public end_to_res(
        res: Response,
        stats?: { input_chars: number; output_chars: number; once_messages_list?: ai_agent_message_item[] }
    ) {
        if (stats?.once_messages_list?.length) {
            const metaData = JSON.stringify({
                __meta__: true,
                once_messages_list: stats.once_messages_list,
            });
            res.write(`data: ${metaData}\n\n`);
        }
        res.write(`data: [DONE]\n\n`);
        res.end();
    }

    public async error_end_to_res(userId:string,session_id:string,user_msg:ai_agent_content,error_msg:string,res: Response) {
        this.write_to_res(res,error_msg);
        this.end_to_res(res);
        try {
            const userMsg: ai_agent_message_item = {
                role: "user",
                content: user_msg,
            };
            const errMsg: ai_agent_message_item = {
                role: "assistant",
                content: error_msg,
            };
            await aiAgentMemoryService.appendTurn(userId, session_id, userMsg, errMsg, {
                input_chars: userMsg.content?.length??0,
                output_chars: getContentAsString(errMsg.content).length,
            });
        } catch (e) {
            console.log(e)
        }

    }

}

export const ai_agentService = new Ai_agentService();
ServerEvent.on("start", (data) => {
    ai_agentService.init().catch(console.error);
})
