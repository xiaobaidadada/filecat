import path from "path";
import fs from "fs";
import fse from "fs-extra";
import {Env} from "../../../common/node/Env";
import {
    data_common_key,
    data_dir_tem_name,
    data_version_type,
    file_key,
} from "./data_type";
import {
    CONTROL_ENV_DEFAULT,
    CONTROL_ENV_STR_DEFAULT,
    control_env_pojo,
    tcp_proxy_client_all_fig,
    tcp_proxy_client_fig,
    tcp_proxy_server_config
} from "../../../common/req/common.pojo";
import {HttpProxyServerInstance, HttpServerProxy} from "../../../common/req/net.pojo";
import {navindex_pojo_type, temp_delete_sys_tag_name} from "../../../common/req/sys.pojo";
import {DataUtil} from "./DataUtil";
import {sort} from "../../../common/ListUtil";
import {userService} from "../user/user.service";
import {stringify_yaml} from "../../../common/node/yaml.util";

/**
 * 单个数据迁移步骤。
 * version：迁移完成后的目标版本号（即 data_version_type 枚举中的值）；
 * name：迁移名称，用于日志；run：迁移函数，内部直接读写 DataUtil。
 */
interface DataMigrationStep {
    version: data_version_type;
    name: string;
    run: () => void;
}

/**
 * 数据版本迁移框架。
 *
 * 背景：项目早期用「版本号 + 一串顺序 if 判断」手推进位迁移历史数据，
 * 版本号既是当前版本又是迁移里程碑，导致逻辑脆弱、难维护。
 * 现改为标准 migration 列表：按 version 升序执行所有 > 当前版本的步骤，
 * 每个步骤独立 try-catch，完成一个立即写回版本号（崩溃可续传，不重复执行）。
 *
 * 新增迁移只需在 migrations 数组末尾追加一个 DataMigrationStep 即可，
 * 无需再在 if 链里手动 version = xxx 推进。
 */
export class DataMigration {
    private static readonly version_file = path.join(Env.work_dir, file_key.data_version);

    // 所有历史数据迁移步骤，按 version 升序排列（新增步骤请追加到末尾）
    private static readonly migrations: DataMigrationStep[] = [
        {
            // 从无版本阶段（filecat_not）升级：将 navindex_key / http_tag_key 从主 data.json 抽离为独立文件
            version: data_version_type.filecat_1,
            name: "抽离 navindex_key / http_tag_key 独立文件",
            run: () => {
                const navindex_key = DataUtil.get(data_common_key.navindex_key);
                const http_tag_key = DataUtil.get(data_common_key.http_tag_key);
                DataUtil.init(file_key.navindex_key);
                DataUtil.init(file_key.http_tag);
                if (navindex_key) {
                    DataUtil.set(data_common_key.navindex_key, navindex_key, file_key.navindex_key);
                    DataUtil.set(data_common_key.navindex_key, null);
                }
                if (http_tag_key) {
                    DataUtil.set(data_common_key.http_tag_key, http_tag_key, file_key.http_tag);
                    DataUtil.set(data_common_key.http_tag_key, null);
                }
            },
        },
        {
            // tcp proxy server 配置：key 字段迁移为 option_keys 数组
            version: data_version_type.handle_tcp_proxy_server_key,
            name: "tcp_proxy server key 迁移为 option_keys",
            run: () => {
                const v: tcp_proxy_server_config = DataUtil.get(data_common_key.tcp_proxy_server_base, file_key.tcp_proxy_server_client);
                if (v) {
                    if (v.key && !v.option_keys?.length) {
                        v.option_keys = [v.key];
                        delete v.key;
                    }
                    DataUtil.set(data_common_key.tcp_proxy_server_base, v, file_key.tcp_proxy_server_client);
                }
            },
        },
        {
            // tcp proxy 客户端配置合并进 all_fig 列表
            version: data_version_type.tcp_proxy_client_all_fig,
            name: "tcp_proxy 客户端配置合并进 all_fig",
            run: () => {
                const v: tcp_proxy_client_fig = DataUtil.get(data_common_key.tcp_proxy_client_fig, file_key.tcp_proxy_server_client);
                if (v) {
                    const fig: tcp_proxy_client_all_fig = DataUtil.get(data_common_key.tcp_proxy_client_all_fig, file_key.tcp_proxy_server_client) ?? {list: []};
                    fig.list.push(v);
                    DataUtil.set(data_common_key.tcp_proxy_client_all_fig, fig, file_key.tcp_proxy_server_client);
                }
            },
        },
        {
            // http 代理服务器从单端口升级为多端口列表
            version: data_version_type.http_proxy_server_multi_port,
            name: "http 代理服务器单端口升级多端口",
            run: () => {
                const old_data: any = DataUtil.get(data_common_key.http_server_key);
                if (old_data) {
                    const new_data: HttpServerProxy = {list: []};
                    if (typeof old_data.port !== 'undefined' || typeof old_data.open !== 'undefined') {
                        const instance: HttpProxyServerInstance = {
                            open: old_data.open ?? false,
                            port: old_data.port ?? 0,
                            note: "",
                            list: old_data.list ?? [],
                        };
                        new_data.list.push(instance);
                    } else if (old_data.list && Array.isArray(old_data.list)) {
                        new_data.list = old_data.list;
                    }
                    DataUtil.set(data_common_key.http_server_key, new_data);
                }
            },
        },
        {
            // 移除系统级 tag 功能：将每个 tag 导出为 .url 文件到临时目录
            version: data_version_type.remove_sys_level_tag,
            name: "移除系统级 tag，导出 .url 文件",
            run: () => {
                const list: navindex_pojo_type[] = DataUtil.get(data_common_key.navindex_key, file_key.navindex_key);
                if (list != null && Array.isArray(list)) {
                    const cache_path = DataUtil.get_dir_path(data_dir_tem_name.tempfile, temp_delete_sys_tag_name);
                    const write_list = (nodes: navindex_pojo_type[], dir: string) => {
                        if (!Array.isArray(nodes) || nodes.length === 0) {
                            return;
                        }
                        for (const item of nodes) {
                            if (!item || !item.name) {
                                continue;
                            }
                            if (item._type !== "dir") {
                                fs.writeFileSync(path.join(dir, `${item.name}.url`), item.url ?? "");
                            }
                            if (Array.isArray(item._children) && item._children.length > 0) {
                                const children_dir = path.join(dir, item.name);
                                fse.ensureDirSync(children_dir);
                                write_list(item._children, children_dir);
                            }
                        }
                    };
                    write_list(list, cache_path);
                }
            },
        },
        {
            // AI 相关字段搬到 ai_setting_data.json，并从 data.json 里移除。
            version: data_version_type.ai_setting_data,
            name: "ai 字段抽离 ai_setting_data.json",
            run: () => {
                // 直接读原始 data.json：迁移后 DataUtil.get 都会带 file_key.ai_setting_data，读不到旧值
                const data_file = path.join(Env.work_dir, file_key.data);
                if (!fs.existsSync(data_file)) {
                    return;
                }
                const raw = JSON.parse(fs.readFileSync(data_file).toString());
                DataUtil.init(file_key.ai_setting_data);
                // 手动列出要搬的字段，不要用 data_common_key 做前缀匹配：
                // 枚举里还有 ai_setting_data(file_key) / ai_agent_chat_session_dir(data_dir_tem_name)，
                // 前缀匹配会把它们也扫进来。
                const ai_keys: data_common_key[] = [
                    data_common_key.ai_agent_model_setting,
                    data_common_key.ai_agent_mcp_setting,
                    data_common_key.ai_agent_docs_setting,
                    data_common_key.ai_agent_chat_session_store,
                    data_common_key.ai_agent_status,
                    data_common_key.ai_system_prompts,
                    data_common_key.ai_rebot_setting,
                    data_common_key.ai_long_term_memory_setting,
                ];
                for (const key of ai_keys) {
                    if (raw[key] === undefined) {
                        continue;
                    }
                    // 先写进新文件，再删掉 data.json 里的原字段
                    DataUtil.set(key, raw[key], file_key.ai_setting_data);
                    DataUtil.del(key, file_key.data);
                }
            },
        },
        {
            // 百度网盘从「全局应用配置 + 账号列表」合并为普通凭据（一条凭据 = 一份应用配置 + 一个授权账号）。
            // 没人用过时这两个 key 都不存在，迁移直接空跑。
            version: data_version_type.baidu_credential_merge,
            name: "百度网盘配置合并为凭据",
            run: () => {
                const app = DataUtil.get<any>(data_common_key.mount_baidu_app);
                const accounts = DataUtil.get<any[]>(data_common_key.mount_baidu_account) ?? [];
                if (!app && accounts.length === 0) {
                    return;
                }
                const list: any[] = DataUtil.get<any[]>(data_common_key.mount_credential_list) ?? [];
                // 把老账号的 uk 映射到新凭据 id，供挂载的 credential_id 改写
                const uk_to_cred: Record<string, string> = {};
                // 没有账号时也要保留应用配置，建一条未授权的凭据
                const sources = accounts.length ? accounts : [null];
                for (const acc of sources) {
                    const id = `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    const name = acc?.name || acc?.baidu_name || app?.name || "百度网盘";
                    list.push({
                        id,
                        type: "baidu",
                        name,
                        config: {
                            name_overridden: Boolean(acc?.name),
                            app_id: app?.app_id,
                            app_key: app?.app_key,
                            secret_key: app?.secret_key,
                            remark: acc?.remark ?? app?.remark ?? "",
                            uk: acc?.uk,
                            baidu_name: acc?.baidu_name,
                            netdisk_name: acc?.netdisk_name,
                            avatar_url: acc?.avatar_url,
                            token: acc?.token,
                        },
                        enabled: acc?.enabled !== false && app?.enabled !== false,
                        created_at: acc?.created_at ?? Date.now(),
                    });
                    if (acc?.uk) {
                        uk_to_cred[String(acc.uk)] = id;
                    }
                }
                DataUtil.set(data_common_key.mount_credential_list, list);
                // 挂载的 credential_id 从「账号 uk」改成「凭据 id」
                const mounts: any[] = DataUtil.get<any[]>(data_common_key.file_mount_list) ?? [];
                let changed = false;
                for (const m of mounts) {
                    if (m.driver === "baidu" && uk_to_cred[String(m.credential_id)]) {
                        m.credential_id = uk_to_cred[String(m.credential_id)];
                        changed = true;
                    }
                }
                if (changed) {
                    DataUtil.set(data_common_key.file_mount_list, mounts);
                }
                // 老数据不再使用
                DataUtil.del(data_common_key.mount_baidu_app, file_key.data);
                DataUtil.del(data_common_key.mount_baidu_account, file_key.data);
            },
        },
        {
            /*
             * 结构化改造：凭据/挂载的 name → note；百度「一凭据一账号」→「凭据=应用 + accounts[] 多账号」。
             *
             * 迁移内容：
             *  1. 所有凭据：name → note
             *  2. 百度凭据：把 config 里的账号字段（uk/token/baidu_name...）拆成 accounts[0]，
             *     config 只留应用配置（app_id/app_key/secret_key），并把挂载的 account_id 指过去
             *  3. 所有挂载：name → note
             */
            version: data_version_type.mount_credential_note,
            name: "挂载凭据 name 改名 note、百度账号拆分为 accounts",
            run: () => {
                const creds: any[] = DataUtil.get<any[]>(data_common_key.mount_credential_list) ?? [];
                // 旧百度凭据 id → 拆分出的账号 id，供挂载改写 account_id
                const cred_to_account: Record<string, string> = {};
                for (const c of creds) {
                    // 1. name → note（note 已存在时以 note 为准）
                    if (c.note === undefined) {
                        c.note = c.name ?? "";
                        delete c.name;
                    }
                    if (c.type !== "baidu") {
                        continue;
                    }
                    const cfg = c.config ?? {};
                    // 已经有 accounts 说明迁过了，跳过
                    if (Array.isArray(c.accounts)) {
                        continue;
                    }
                    const accounts: any[] = [];
                    if (cfg.uk && cfg.token) {
                        accounts.push({
                            id: String(cfg.uk),
                            note: c.note ?? "",
                            token: cfg.token,
                            account_name: cfg.baidu_name,
                            nickname: cfg.netdisk_name,
                            avatar_url: cfg.avatar_url,
                        });
                        cred_to_account[c.id] = String(cfg.uk);
                    }
                    // config 只保留应用配置
                    c.config = {
                        app_id: cfg.app_id,
                        app_key: cfg.app_key,
                        secret_key: cfg.secret_key,
                    };
                    c.accounts = accounts;
                }
                DataUtil.set(data_common_key.mount_credential_list, creds);

                const mounts: any[] = DataUtil.get<any[]>(data_common_key.file_mount_list) ?? [];
                for (const m of mounts) {
                    // name → note
                    if (m.note === undefined) {
                        m.note = m.name ?? "";
                        delete m.name;
                    }
                    // 百度挂载补上 account_id（单账号场景直接指向刚拆出的那个账号）
                    if (m.driver === "baidu" && !m.account_id) {
                        const acc_id = cred_to_account[m.credential_id];
                        if (acc_id) {
                            m.account_id = acc_id;
                        }
                    }
                }
                DataUtil.set(data_common_key.file_mount_list, mounts);
            },
        },
        {
            // 环境控制配置从 env 语法（key = [数组]）迁移为 yaml 语法。
            // 旧文本里的注释行直接丢弃，未注释的项原样搬成 yaml 结构；
            // 解析失败时保留原文本不动，用户进设置页能看到并自行修正。
            version: data_version_type.control_env_yaml,
            name: "环境控制配置迁移为 yaml 语法",
            run: () => {
                const env_data: any = DataUtil.get(data_common_key.sys_env_key);
                if (!env_data || typeof env_data.control_env_str !== "string") return;
                const old_str: string = env_data.control_env_str;
                if (!old_str.trim()) {
                    env_data.control_env_str = CONTROL_ENV_STR_DEFAULT;
                    env_data.control_env = {...CONTROL_ENV_DEFAULT};
                    DataUtil.set(data_common_key.sys_env_key, env_data);
                    return;
                }
                // 已经像 yaml（有冒号缩进/列表）的不重复迁移
                if (/^\s*[a-z_]+\s*:\s*$/m.test(old_str) || /^\s*-\s+/m.test(old_str)) {
                    return;
                }

                const parsed: control_env_pojo = {};
                Env.load(old_str, parsed);

                const data: any = {};
                if (Array.isArray(parsed.allowed_hosts) && parsed.allowed_hosts.length) {
                    data.allowed_hosts = parsed.allowed_hosts;
                }
                if (Array.isArray(parsed.forbid_hosts) && parsed.forbid_hosts.length) {
                    data.forbid_hosts = parsed.forbid_hosts;
                }
                if (parsed.allowed_private_host !== undefined) {
                    data.allowed_private_host = parsed.allowed_private_host;
                }
                // 旧版没有转发规则，这里只迁移访问控制部分
                env_data.control_env_str = stringify_yaml(data);
                env_data.control_env = parsed;
                DataUtil.set(data_common_key.sys_env_key, env_data);
            },
        },
        {
            /*
             * AI 供应商配置的一次性整理 + 数据文件名补后缀。
             *
             * 1. 额外参数从 ini 语法（dotenv）迁移为 yaml 语法（yaml_env）。
             *    ini（key=value）不是合法的 yaml 键值对，直接换解析器会把内容读成一整段字符串，
             *    所以这里显式转一次：dotenv 用 Env.load 解析成对象，写回 yaml_env，清空 dotenv。
             *
             * 2. 字段 support_image 更名为 image_understanding。
             *    它存在两处都要改，否则老配置里关掉的图片理解会静默回到默认开启：
             *      a) yaml_env 文本里的 support_image: xxx
             *      b) 对象上直接被写过的 support_image 属性（老代码 Env.load 遗留）
             *
             * 3. tcp_proxy_server_client 数据文件补上 .json 后缀。
             *    必须在 DataUtil.init 建出空文件之前改，否则旧数据会被空文件顶掉。
             *    DataMigration.run 在 start_main 里早于各服务启动，时机是安全的。
             *
             * 内置供应商如果 yaml_env 为空（从未被用户改过），不写入，
             * 交给 setting 初始化时填默认模板。
             */
            version: data_version_type.ai_agent_yaml_env,
            name: "ai 供应商额外参数迁移为 yaml",
            run: () => {
                // ---- 3. tcp 代理数据文件补后缀 ----
                // 旧文件存在就以它为准：可能有别的入口在迁移前已经 DataUtil.init 建出了空的 .json，
                // 此时新文件只是空壳，直接覆盖掉，否则旧数据会被空文件顶掉。
                // 迁移完必须 reload，把已进缓存（可能是空对象）的数据换成磁盘上的真实内容。
                const legacy_tcp_path = path.join(Env.work_dir, "tcp_proxy_server_client");
                const tcp_path = path.join(Env.work_dir, file_key.tcp_proxy_server_client);
                if (fs.existsSync(legacy_tcp_path)) {
                    fse.ensureDirSync(Env.work_dir);
                    fs.copyFileSync(legacy_tcp_path, tcp_path);
                    fs.unlinkSync(legacy_tcp_path);
                    DataUtil.reload(file_key.tcp_proxy_server_client);
                    console.log(`[数据迁移] 迁移旧数据文件 ${legacy_tcp_path} -> ${tcp_path}`);
                }

                /** 把一段 ini 文本转成 yaml 文本，失败返回 null 表示不动 */
                const ini_to_yaml = (old_text?: string): string | null => {
                    if (typeof old_text !== "string" || !old_text.trim()) {
                        return null;
                    }
                    // 已经像 yaml（行首「key:」或列表项「- 」）就不重复迁移
                    if (/^\s*[\w.-]+\s*:/m.test(old_text) || /^\s*-\s+/m.test(old_text)) {
                        return null;
                    }
                    const parsed: any = {};
                    try {
                        Env.load(old_text, parsed);
                    } catch (e) {
                        // 解析失败保留原文，让用户进设置页自行修正
                        return null;
                    }
                    return stringify_yaml(parsed);
                };

                /** 把 yaml 文本里的 support_image 换成 image_understanding */
                const rename_image_key = (text?: string): string | undefined => {
                    if (typeof text !== "string" || !text.includes("support_image")) {
                        return undefined;
                    }
                    return text.replace(/^(\s*)support_image(\s*:)/gm, "$1image_understanding$2");
                };

                /** 把对象上的 support_image 搬到 image_understanding，已存在则不覆盖 */
                const rename_image_prop = (obj: any) => {
                    if (!obj || typeof obj !== "object" || !("support_image" in obj)) {
                        return false;
                    }
                    if (obj.image_understanding === undefined) {
                        obj.image_understanding = obj.support_image;
                    }
                    delete obj.support_image;
                    return true;
                };

                /** 处理一条供应商/全局配置，返回是否有改动 */
                const migrate_one = (item: any): boolean => {
                    let changed = rename_image_prop(item);

                    // 没迁移过才做 ini -> yaml；已经转换过的直接清掉废弃字段
                    if (item.yaml_env === undefined) {
                        const yaml_text = ini_to_yaml(item.dotenv);
                        if (yaml_text !== null) {
                            item.yaml_env = yaml_text;
                            changed = true;
                        }
                    }
                    delete item.dotenv;

                    // 老配置里可能存的是 support_image，转完 yaml 再改 key
                    const next_text = rename_image_key(item.yaml_env);
                    if (next_text !== undefined) {
                        item.yaml_env = next_text;
                        changed = true;
                    }
                    return changed;
                };

                const setting: any = DataUtil.get(data_common_key.ai_agent_model_setting, file_key.ai_setting_data);
                if (setting) {
                    let changed = false;
                    const models: any[] = Array.isArray(setting.models) ? setting.models : [];
                    for (const item of models) {
                        if (migrate_one(item)) {
                            changed = true;
                        }
                    }
                    if (changed) {
                        DataUtil.set(data_common_key.ai_agent_model_setting, setting, file_key.ai_setting_data);
                    }
                }

                // 全局配置是独立的 key，单独处理
                const global_cfg: any = DataUtil.get(data_common_key.ai_agent_global_setting, file_key.ai_setting_data);
                if (global_cfg && migrate_one(global_cfg)) {
                    DataUtil.set(data_common_key.ai_agent_global_setting, global_cfg, file_key.ai_setting_data);
                }
            },
        },
    ];

    private static is_data_version_type(value) {
        for (const it of this.migrations) {
            if (it.version === value) {
                return true;
            }
        }
        return false
    }

    private static getMaxDataVersionType(): number {
       let max = 0;
        for (const it of this.migrations) {
            if (it.version > max) {
                max = it.version;
            }
        }
       return max;
    }

    // 读取当前数据版本号（无版本文件时返回 filecat_not 表示从未迁移）
    private static get_current_version(): data_version_type {
        if (!fs.existsSync(this.version_file)) {
            if(fs.existsSync(path.join(Env.work_dir, file_key.data))) {
                return data_version_type.filecat_not;
            }
            return data_version_type.undefine;
        }
        const value = parseInt(fs.readFileSync(this.version_file).toString());
        if (this.is_data_version_type(value)) {
            return value as data_version_type;
        }
        return data_version_type.undefine;
    }

    // 执行所有未应用的数据迁移
    public static run(): void {
        const current = this.get_current_version();
        if (current === data_version_type.undefine) {
            this.write_version(this.getMaxDataVersionType())
            return;
        }
        const migrations = sort(this.migrations,(v)=>v.version)
        for (const step of migrations) {
            if (step.version <= current) {
                continue; // 已迁移过，跳过
            }
            try {
                step.run();
                this.write_version(step.version);
                console.log(`[数据迁移] 完成: ${step.name} -> v${step.version}`);
            } catch (e) {
                // 单个迁移失败不阻断后续迁移，但记录错误；版本号不推进，下次启动会重试该步骤
                console.error(`[数据迁移] 失败: ${step.name} -> v${step.version}`, e);
            }
        }
    }

    private static write_version(version: data_version_type): void {
        fs.writeFileSync(this.version_file, `${version}`);
    }
}
