import {ai_tools, ai_tools_search_docs} from "./ai_agent.constant";
import {ai_agent_messages} from "../../../common/req/common.pojo";
import {Response} from "express";
import {Readable} from "stream";
import os from "os";
import {Ai_agentTools, Ai_agentTools_type} from "./ai_agent.tools";
import {settingService} from "../setting/setting.service";
import path from "path";
import {userService} from "../user/user.service";
import {exec_type} from "pty-shell";
import {shellServiceImpl} from "../shell/shell.service";
import {UserAuth, UserData} from "../../../common/req/user.req";
import {
    ai_agent_Item,
    ai_agent_item_dotenv,
    ai_docs_item,
    ai_docs_load_info,
    ai_docs_setting_param
} from "../../../common/req/setting.req";
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
import {data_dir_tem_name, file_key} from "../data/data_type";
import {pinyin} from "pinyin-pro";
import {hash_str_to_number} from "../../../common/node/value.util";

const {
    cut,
    cut_all,
    cut_for_search,
    tokenize,
    add_word,
} = require("jieba-wasm");

let API_KEY = process.env.AI_API_KEY;
let BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
let MODEL = "doubao-seed-1-6";
let config: ai_agent_Item
let config_env = new ai_agent_item_dotenv()
let config_search_doc = new ai_docs_setting_param()

// 判断是否中文
function isChinese(str: string) {
    return /[\u4e00-\u9fa5]/.test(str);
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


    public async search_docs({keywords}: { keywords: string[] }) {
        const scoreMap = new Map<string, number>();
        const new_keywords = {}
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
            if (total_char_num >= config_search_doc.docs_max_char_num) {
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

    init_search_docs_param() {
        if (!this.sys_ai_is_open) return;
        const setting = settingService.ai_docs_setting()
        Env.load(setting.param, config_search_doc);
        // console.log(`ai知识库参数`, JSON.stringify(config_search_doc))
    }

    async load_one_file(token: string, param_path: string) {
        if (!this.sys_ai_is_open) return;
        const root_path = settingService.getFileRootPath(token);
        let sysPath = decodeURIComponent(param_path)
        if (isAbsolutePath(sysPath)) {

        } else {
            sysPath = path.join(root_path, sysPath);
        }
        userService.check_user_path(token, sysPath)
        await this.init_search_docs([{
            auto_load: true,
            dir: sysPath
        }])
    }

    private async add_content(file_path: string) {
        return  ThreadsFilecat.post(threads_msg_type.docs_add, {
            use_zh_segmentation:
            config_search_doc.use_zh_segmentation
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
        this.docs_info.init(0)
    }

    running_num = 1

    private push_wss(now: number) {
        this.docs_info.consume_time_ms_len = Date.now() - now
        this.docs_info.total_num = this.docs_data_map.size
        Wss.sendToAllClient(CmdType.ai_load_info, this.docs_info, this.all_wss_set)
    }

    async init_search_docs(target_list?: ai_docs_item[]) {
        if (!this.sys_ai_is_open) return;
        start_worker_threads()
        const now = Date.now();
        const body = {index_storage_type: config_search_doc.index_storage_type}
        if (config_search_doc.index_storage_type === 'sqlite') {
            body['db_path'] = DataUtil.get_file_path(data_dir_tem_name.sys_database_dir, file_key.fts5_rag_db)
        }
        await ThreadsFilecat.post(threads_msg_type.docs_init, body, 60 * 1000)
        // const is_one_load = target_list != null;
        this.docs_info.init(0)

        this.push_wss(now)

        const dir_recursion_depth = config_search_doc.dir_recursion_depth
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
        if (config_search_doc.ignore_dir) {
            if (typeof config_search_doc.ignore_dir === 'string') {
                ignore_list.push(config_search_doc.ignore_dir);
            } else {
                if (Array.isArray(config_search_doc.ignore_dir)) {
                    ignore_list = config_search_doc.ignore_dir
                }
            }
        }
        if (config_search_doc.allow_file_path) {
            if (typeof config_search_doc.allow_file_path === 'string') {
                allow_list.push(config_search_doc.allow_file_path);
            } else {
                if (Array.isArray(config_search_doc.allow_file_path)) {
                    allow_list = config_search_doc.allow_file_path
                }
            }
        }


        const files_set = new Set<number>();
        let update_file_num = 0
        let await_file_total = config_search_doc.await_file_num ?? 0;
        // let file_char_num = 0
        const add_file_path_list: string[] = []
        const update_file_path_list: string[] = []
        // const delete_file_path_list: string[] = []
        // 处理单个文件
        const handleFile = async (file_path: string, file_name: string) => {
            if (files_set.size >= config_search_doc.max_file_num) {
                return;
            }
            if (running_num != this.running_num) return;
            if (config_search_doc.allow_file_path) {
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
                await_file_total = config_search_doc.await_file_num ?? 0;
                if (config_search_doc.await_time_ms_len) {
                    await CommonUtil.sleep(config_search_doc.await_time_ms_len);
                }
            } else {
                await_file_total--
            }
            const file_stats = await FileUtil.statSync(file_path);
            if (!file_stats.isFile()) return;
            if (file_stats.size > config_search_doc.max_file_byte_size) {
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
        const async_poll = new AsyncPool(config_search_doc.max_file_concurrency)


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
                if (files_set.size >= config_search_doc.max_file_num) {
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
        this.docs_info.init(0)
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
        return config_env;
    }

    public sys_ai_is_open = false

    public load_key() {
        config_env = new ai_agent_item_dotenv()
        this.sys_ai_is_open = false
        const r = settingService.ai_agent_setting()
        for (const it of r.models) {
            if (it.open) {
                MODEL = it.model
                BASE_URL = it.url
                API_KEY = it.token
                config = it
                if (it.dotenv) {
                    Env.load(it.dotenv, config_env);
                }
                this.sys_ai_is_open = true
                return
            }
        }
        config = undefined
        API_KEY = undefined
        BASE_URL = undefined
        MODEL = undefined
    }

    private trimMessages(
        messages: ai_agent_messages,
        maxChars = 12000
    ) {
        let total = 0;
        const result: ai_agent_messages = [];

        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const size = JSON.stringify(msg).length;
            if (total + size > maxChars) break;
            total += size;
            result.unshift(msg);
        }
        return result;
    };

    private async permission_test(token, user: UserData, toolName, args: any) {
        switch (toolName) {
            case "exec_cmd": {
                const cmd = args.cmd?.trim();
                if (!cmd) throw new Error("cmd 不能为空");

                const argv = cmd.split(" ");
                const code = await shellServiceImpl.check_exe_cmd({
                    user_id: user.id,
                    cwd: process.cwd()
                })(argv, argv.slice(1));

                if (code === exec_type.not) {
                    throw new Error(`没有权限执行命令：${cmd}`);
                }
                break;
            }

            case "list_files":
            case "read_file":
                userService.check_user_path(token, args.path);
                break;

            case "edit_file":
                userService.check_user_path(token, args.path);
                userService.check_user_auth(
                    token,
                    UserAuth.filecat_file_delete_cut_rename
                );
                break;
        }

    }

    private is_use_local_data() {
        return this.docs_data_map.size > 0
    }

    /**
     * 对话每一次都需要把之前全部的message填充过去，所以对话越长，每一次对话的时候消耗的token越多
     * todo 添加记忆能力，每一次对话都不断的让ai总结之前的聊天内容，节省token，现在可以通过让AI返回的时候内容尽量简洁一点，从而节省一点token
     * @param originMessages
     * @param res
     * @param token
     */
    public async chat(
        originMessages: ai_agent_messages,
        res: Response,
        token: string
    ) {
        if (!API_KEY) {
            throw new Error("api 没有设置，请设置诸如豆包、openai 的 model api");
        }

        const user = userService.get_user_info_by_token(token);
        const rootPath = settingService.getFileRootPath(token);

        const workMessages: ai_agent_messages = [
            {
                role: "system",
                content: `
1. 你是一个服务器机器人，当前操作系统是 ${os.platform()}，
   当前目录是 ${rootPath}，
   当前系统登陆用户是 ${user.username}，用户的id为 ${user.user_id}，${user.note}。
2. 使用 markdown格式回答用户。
3. 你是开源项目filecat的一部分，项目地址 https://github.com/xiaobaidadada/filecat。
${this.is_use_local_data() ? `4. 当你不了解某些知识的时候，直接使用search_docs工具函数来搜素本地知识库搜索相关资料，如果用到了知识库,需要给用户引用的知识库文件路径。` : ''}

${config.sys_prompt ?? ''}
`
            },
            ...this.trimMessages(originMessages, config_env.char_max)
        ];

        if (config_search_doc.force_use_local_data) {
            const t_ = await this.search_docs({keywords: [workMessages[workMessages.length - 1].content]})
            workMessages[workMessages.length - 1].content = `本地知识库搜到 ${t_} 
            ${workMessages[workMessages.length - 1].content}`
        }

        const env = {
            toolLoop: config_env.tool_call_max,
            tool_error_max: config_env.tool_error_max
        };
        const controller = new AbortController();

        if (res) {
            res.on("close", () => {
                controller.abort();   // 👈 核心
            });
        }

        while (env.toolLoop-- > 0) {

            // 🔹 用来拼完整 assistant message
            let assistantMessage: any = {
                role: "assistant",
                content: "",
                tool_calls: []
            };

            const toolCallMap = new Map<number, any>();


            // 🔹 调用 LLM（流式）
            await this.callLLSync(
                workMessages,
                // ===== call_data =====
                (chunk) => {
                    if (!chunk) return;
                    // ===== 1. 普通内容流 =====
                    if (chunk.content) {
                        assistantMessage.content += chunk.content;
                        this.write_to_res(res, chunk.content);
                    }

                    // ===== 2. tool_calls 流 =====
                    if (chunk.tool_calls) {
                        for (const tc of chunk.tool_calls) {
                            const idx = tc.index;

                            if (!toolCallMap.has(idx)) {
                                toolCallMap.set(idx, {
                                    id: tc.id,
                                    type: "function",
                                    function: {
                                        name: tc.function?.name ?? "",
                                        arguments: ""
                                    }
                                });
                            }

                            const call = toolCallMap.get(idx);
                            if (tc.id) {
                                call.id = tc.id;
                            }


                            // name 只会来一次
                            if (tc.function?.name) {
                                call.function.name = tc.function.name;
                            }

                            // arguments 是流式拼接的
                            if (tc.function?.arguments) {
                                call.function.arguments += tc.function.arguments;
                            }
                        }
                    }
                }
                ,
                // ===== error_call =====
                (e) => {
                    throw e
                },
                controller
            );
            assistantMessage.tool_calls = Array.from(toolCallMap.values());
            if (assistantMessage.tool_calls.length > 0) {
                assistantMessage.content = null;
            }

            // ✅ 一次 LLM 完整结束，补 push assistant
            workMessages.push(assistantMessage);

            // ❌ 没有 tool_calls，直接结束
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                this.end_to_res(res);
                return res;
            }

            // ✅ 有 tool_calls，开始执行工具
            for (const call of assistantMessage.tool_calls) {
                let args: any = {};
                try {
                    args = JSON.parse(call.function.arguments || "{}");
                } catch (e) {
                    throw new Error(`工具参数 JSON 解析失败: ${call.function.arguments}`);
                }
                const toolName = call.function.name as Ai_agentTools_type;

                await this.permission_test(token, user, toolName, args);

                try {
                    let result = await Ai_agentTools[toolName](args);
                    let resultStr = String(result);

                    if (resultStr.length > 5000) {
                        resultStr = resultStr.slice(0, 4000) + "\n...（内容过长已截断）";
                    }

                    workMessages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: resultStr
                    });
                } catch (e) {
                    if (env.tool_error_max-- <= 0) throw e;

                    workMessages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: String(e)
                    });
                }
            }
        }


        this.write_to_res(res, "超出最大理解语义次数");
        this.end_to_res(res);
        return res;
    }


    public write_to_res(res: Response, text: string) {
        res.write(
            `event: message\ndata: ${JSON.stringify(text)}\n\n`
        );
    }

    public end_to_res(res: Response) {
        res.write(`data: [DONE]\n\n`);
        res.end();
    }

    // 暂时不用
    private async flow_call(res: Response, work_messages: ai_agent_messages) {
        const finalMessages: ai_agent_messages = this.trimMessages(work_messages);
        finalMessages.push({
            role: 'system',
            content: '现在基于以上结果对用户进行简洁的回答，并使用markdown的格式。'
        })
        let json_body: any = {
            model: MODEL,
            messages: finalMessages,
            stream: true,
            temperature: 0.7
        }
        try {
            if (config.json_params) {
                const obj = JSON.parse(config.json_params);
                for (const key of Object.keys(obj)) {
                    json_body[key] = obj[key];
                }
            }
        } catch (err) {
            console.log(err)
        }
        // const l_time = Date.now();
        const aiResponse = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify(json_body)
        });
        // console.log(`最终回答耗时: ${((Date.now() - l_time)/1000)} s`)
        if (!aiResponse.ok || !aiResponse.body) {
            res.write(
                `event: error\ndata: ${aiResponse.status === 413
                    ? "请求内容过大（413）"
                    : "AI 请求失败"
                }\n\n`
            );
            res.end();
            return res;
        }
        if (!json_body.stream) {
            const r: any = await aiResponse.json()
            const msg = r.choices[0].message;
            this.write_to_res(res, msg.content);
            res.end();
            return res;
        }
        const nodeStream = Readable.fromWeb(aiResponse.body as any);
        res.on("close", () => {
            nodeStream.destroy();
        });
        nodeStream.pipe(res);
        return nodeStream;
    }

    private async callLLSync(messages: ai_agent_messages,
                             call_data: (message: any) => void,
                             error_call: (e) => void,
                             controller: AbortController
    ) {
        // const l_time = Date.now();
        const tools: any[] = [...ai_tools]
        if (this.is_use_local_data()) {
            tools.push(ai_tools_search_docs)
        }
        const json_body: any = {
            messages,
            tools: tools,
            temperature: 0.2,
            model: MODEL,
            // thinking : { // 豆包深度思考
            //     "type":"disabled"
            // }
        }
        try {
            if (config.json_params) {
                const obj = JSON.parse(config.json_params);
                for (const key of Object.keys(obj)) {
                    json_body[key] = obj[key];
                }
            }
        } catch (err) {
            console.log(err)
        }
        // 最后重新赋值确保不会被修改
        json_body.tools = tools
        json_body.messages = messages
        const res = await fetch(BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify(json_body),
            signal: controller.signal   // 👈 绑定 signal
        });
        // console.log(`一次请求耗时 ${(Date.now() - l_time)/1000} s`)
        const contentType = res.headers.get("content-type") || "";
        const isSSE = contentType.includes("text/event-stream");
        if (isSSE) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                buf += decoder.decode(value, {stream: true});
                // SSE 按 \n\n 分段
                let parts = buf.split(/\r?\n\r?\n/);
                buf = parts.pop()!; // 留下未完整的一段

                for (const part of parts) {
                    // 过滤空段
                    if (!part.trim()) continue;
                    // SSE 可能包含多行 data:
                    const lines = part.split('\n');
                    let dataLines: string[] = [];
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            dataLines.push(line.replace(/^data:\s*/, ''));
                        }
                    }
                    const dataStr = dataLines.join('\n');
                    // [DONE] 表示结束
                    if (dataStr.trim() === '[DONE]') {
                        return;
                    }
                    // 解析 JSON 并回调
                    try {
                        const json = JSON.parse(dataStr);
                        // 你可以根据接口结构取你想要的字段
                        const message = json.choices?.[0]?.delta ?? json.choices?.[0]?.message;
                        if (message)
                            call_data(message);
                    } catch (e) {
                        if (e.name === "AbortError") {
                            // 客户端断开，正常终止
                            return;
                        }
                        error_call(e)
                        return
                    }
                }
            }
            // 如果读完了也结束
            return
        }

        if (!res.ok) {
            const text = await res.text();
            try {
                const json = JSON.parse(text);
                error_call((json.message || json.error?.message || text))
            } catch {
                error_call(text)
            }
            return
        }
        call_data((await res.json() as any).choices[0].message)
    }

}

export const ai_agentService = new Ai_agentService();