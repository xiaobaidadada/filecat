import path from "path";
import fs from "fs";
import fse from "fs-extra";
import {Env} from "../../../common/node/Env";
import {
    data_common_key,
    data_dir_tem_name,
    data_version_type,
    file_key,
    getMaxDataVersionType,
    is_data_version_type
} from "./data_type";
import {tcp_proxy_client_all_fig, tcp_proxy_client_fig, tcp_proxy_server_config} from "../../../common/req/common.pojo";
import {HttpProxyServerInstance, HttpServerProxy} from "../../../common/req/net.pojo";
import {navindex_pojo_type, temp_delete_sys_tag_name} from "../../../common/req/sys.pojo";
import {UserData} from "../../../common/req/user.req";
import {DataUtil} from "./DataUtil";


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
            // 标记所有用户「网址导航 tag 删除」提示为待提示
            version: data_version_type.user_notify_tag_delete,
            name: "标记用户 tag 删除提示",
            run: () => {
                const user_mapping: {
                    [keys: string]: UserData
                } = DataUtil.get<any>(data_common_key.user_id_info_data_mapping) ?? {};
                let user_changed = false;
                for (const user_id of Object.keys(user_mapping)) {
                    const user_data = user_mapping[user_id];
                    if (!user_data) {
                        continue;
                    }
                    let v = true
                    if (user_data.sys_done_prompt?.tag_delete) {
                        v = false
                    } else if (user_data.sys_done_prompt?.tag_delete === false) {
                        continue
                    }
                    user_data.sys_done_prompt = {...(user_data.sys_done_prompt ?? {}), tag_delete: v};
                    user_changed = true;
                }
                if (user_changed) {
                    DataUtil.set(data_common_key.user_id_info_data_mapping, user_mapping);
                }
            },
        },
    ];

    // 读取当前数据版本号（无版本文件时返回 filecat_not 表示从未迁移）
    private static get_current_version(): data_version_type {
        if (!fs.existsSync(this.version_file)) {
            if(fs.existsSync(path.join(Env.work_dir, file_key.data))) {
                return data_version_type.filecat_not;
            }
            return data_version_type.undefine;
        }
        const value = parseInt(fs.readFileSync(this.version_file).toString());
        if (is_data_version_type(value)) {
            return value as data_version_type;
        }
        return data_version_type.undefine;
    }

    // 执行所有未应用的数据迁移
    public static run(): void {
        const current = this.get_current_version();
        if (current === data_version_type.undefine) {
            this.write_version(getMaxDataVersionType())
            return;
        }
        for (const step of this.migrations) {
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
