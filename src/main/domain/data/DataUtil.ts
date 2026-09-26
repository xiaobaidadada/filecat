import path from "path";
import fs from "fs";
import fse from 'fs-extra'
import {Env} from "../../../common/node/Env";
import {data_common_key, data_dir_tem_name, data_version_type, file_key, is_data_version_type} from "./data_type";
import {tcp_proxy_client_all_fig, tcp_proxy_client_fig, tcp_proxy_server_config} from "../../../common/req/common.pojo";
import {HttpProxyServerInstance, HttpServerProxy} from "../../../common/req/net.pojo";
import {navindex_pojo_type, temp_delete_sys_tag_name} from "../../../common/req/sys.pojo";
import {UserData} from "../../../common/req/user.req";


export class DataUtil {
    private static data_path_map = {};
    private static data_map = {};

    // private static data_path = "";
    // private static data = {};

    public static get_tem_path(type:data_dir_tem_name) {
        const p = path.join(Env.work_dir, type);
        fse.ensureDirSync(p)
        return p;
    }

    private static get_data_version():data_version_type {
        const p = path.join(Env.work_dir, file_key.data_version);
        if (!fs.existsSync(p)) {
            return data_version_type.filecat_not
        }
        const value = parseInt(fs.readFileSync(p).toString());
        if(is_data_version_type(value)) {
            return value as data_version_type;
        } else {
            return data_version_type.undefine;
        }
    }

    // 处理历史数据版本
    public static handle_history_data() {
        try {
            const  p_v = path.join(Env.work_dir, file_key.data_version)
            let version = this.get_data_version();
            if(version < data_version_type.filecat_1 && version === data_version_type.filecat_not) {
                // 升级到 data_version_type.filecat_1
                const navindex_key = this.get(data_common_key.navindex_key);
                const http_tag_key = this.get(data_common_key.http_tag_key);
                this.init(file_key.navindex_key);
                this.init(file_key.http_tag);
                if(navindex_key) {
                    this.set(data_common_key.navindex_key, navindex_key,file_key.navindex_key);
                    this.set(data_common_key.navindex_key,null );
                }
                if(http_tag_key) {
                    this.set(data_common_key.http_tag_key, http_tag_key,file_key.http_tag);
                    this.set(data_common_key.http_tag_key,null );
                }
                version = data_version_type.filecat_1
            }

            if(version < data_version_type.handle_tcp_proxy_server_key) {
                const v :tcp_proxy_server_config = DataUtil.get(data_common_key.tcp_proxy_server_base,file_key.tcp_proxy_server_client)
                if(v) {
                    if(v.key && !v.option_keys?.length) {
                        v.option_keys = [v.key]
                        delete v.key
                    }
                    DataUtil.set(data_common_key.tcp_proxy_server_base,v,file_key.tcp_proxy_server_client)
                }
                version = data_version_type.handle_tcp_proxy_server_key
            }

            if(version < data_version_type.tcp_proxy_client_all_fig) {
                const v :tcp_proxy_client_fig = DataUtil.get(data_common_key.tcp_proxy_client_fig,file_key.tcp_proxy_server_client)
                if(v) {
                    const fig:tcp_proxy_client_all_fig = DataUtil.get(data_common_key.tcp_proxy_client_all_fig,file_key.tcp_proxy_server_client)??{list:[]}
                    fig.list.push(v)
                    DataUtil.set(data_common_key.tcp_proxy_client_all_fig,fig,file_key.tcp_proxy_server_client)
                }
                version = data_version_type.tcp_proxy_client_all_fig
            }

            //  数据迁移：Http Proxy Server 从单端口升级为多端口列表
            if(version < data_version_type.http_proxy_server_multi_port) {
                const old_data: any = DataUtil.get(data_common_key.http_server_key);
                if(old_data) {
                    // 旧数据结构: { port, open, list: HttpServerProxyItem[] }
                    // 新数据结构: { list: HttpProxyServerInstance[] }
                    const new_data: HttpServerProxy = { list: [] };

                    // 检查是否为旧格式（旧格式有 port 和 open 属性在顶层）
                    if(typeof old_data.port !== 'undefined' || typeof old_data.open !== 'undefined') {
                        // 旧格式：将旧的单端口数据迁移到新格式的第一个实例中
                        const instance: HttpProxyServerInstance = {
                            open: old_data.open ?? false,
                            port: old_data.port ?? 0,
                            note: "",
                            list: old_data.list ?? [],
                        };
                        new_data.list.push(instance);
                    } else if(old_data.list && Array.isArray(old_data.list)) {
                        // 可能已经是新格式或者空数据，直接保留
                        new_data.list = old_data.list;
                    }

                    DataUtil.set(data_common_key.http_server_key, new_data);
                }
                version = data_version_type.http_proxy_server_multi_port
            }
            if (version < data_version_type.remove_sys_level_tag) {
                const list: navindex_pojo_type[] = DataUtil.get(data_common_key.navindex_key, file_key.navindex_key);
                if (list != null && Array.isArray(list)) {
                    const cache_path = DataUtil.get_dir_path(data_dir_tem_name.tempfile, temp_delete_sys_tag_name);
                    // 递归的遍历所有的 list ，将里面的 name 作为文件名 (后缀都是.url) 文件内容都是url值，生成按照父子关系的 在 cache_path 下的递归目录文件
                    const write_list = (nodes: navindex_pojo_type[], dir: string) => {
                        if (!Array.isArray(nodes) || nodes.length === 0) {
                            return;
                        }
                        for (const item of nodes) {
                            if (!item || !item.name) {
                                continue;
                            }
                            if(item._type !== "dir") {
                                fs.writeFileSync(path.join(dir, `${item.name}.url`), item.url??"");
                            }
                            // 有子节点的节点：创建同名子目录，并递归
                            if (Array.isArray(item._children) && item._children.length > 0) {
                                const children_dir = path.join(dir, item.name);
                                fse.ensureDirSync(children_dir);
                                write_list(item._children, children_dir);
                            }
                        }
                    };
                    write_list(list, cache_path);
                }
                version = data_version_type.remove_sys_level_tag
            }
            if (version < data_version_type.user_notify_tag_delete) {
                // 标记所有用户「网址导航 tag 删除」的提示为待提示（true），
                // 用户前端看到提示并确认后会被置回 false，避免重复提示
                const user_mapping:{[keys:string]:UserData} = this.get<any>(data_common_key.user_id_info_data_mapping) ?? {};
                let user_changed = false;
                for (const user_id of Object.keys(user_mapping)) {
                    const user_data = user_mapping[user_id];
                    if (!user_data) {
                        continue;
                    }
                    if (!user_data.sys_done_prompt?.tag_delete) {
                        user_data.sys_done_prompt = {...(user_data.sys_done_prompt ?? {}), tag_delete: true};
                    }
                    user_changed = true;
                }
                if (user_changed) {
                    this.set(data_common_key.user_id_info_data_mapping, user_mapping);
                }
                version = data_version_type.user_notify_tag_delete
            }
            fs.writeFileSync(p_v, `${version}`);
        } catch (e) {
            console.log('历史数据处理失败',e);
        }
    }

    private static init(file:file_key,default_value:string = "{}") {
        let value = this.data_path_map[file];
        if (value === undefined || value=== null) {
            this.data_path_map[file] = value = path.join(Env.work_dir, file);
            if (!fs.existsSync(value)) {
                fse.ensureDirSync(Env.work_dir)
                fs.writeFileSync(value, default_value);
                this.data_map[file] = {};
            } else {
                this.data_map[file] = JSON.parse(fs.readFileSync(value).toString());
            }
        }
    }

    private static checkFile(k,dir) {
        const p = path.join(Env.work_dir, dir, k);
        if (!fs.existsSync(p)) {
            fse.ensureDirSync( path.join(Env.work_dir, dir));
            fs.writeFileSync(p, "");
            return false;
        }
        return true;
    }

    public static get<T>(k:data_common_key, file:file_key = file_key.data): T {
        this.init(file);
        return this.data_map[file][k];
    }

    public static get_file_path(dir:data_dir_tem_name,file:file_key|`tcp_proxy_file_sync_${string}.json` ): string {
        // const p = path.join(Env.work_dir, dir);
        // fse.ensureDirSync( p);
        const p = this.get_dir_path(dir)
        return path.join(p,file);
    }

    public static get_dir_path(dir:data_dir_tem_name,tempname?:string ): string {
        let p = path.join(Env.work_dir, dir);
        if(tempname) {
            p = path.join(p, tempname);
        }
        fse.ensureDirSync( p);
        return p;
    }

    public static set(k:data_common_key, v, file:file_key = file_key.data) {
        this.init(file);
        this.data_map[file][k] = v;
        // FileUtil.writeFileSync(this.data_path_map[file], JSON.stringify(this.data_map[file])).catch(err=>{
        //     console.log(`数据持久化错误`,err)
        // });
        fs.writeFileSync(this.data_path_map[file], JSON.stringify(this.data_map[file]));
    }

    public static del(k:data_common_key,file:file_key = file_key.data) {
        this.init(file);
        delete this.data_map[file][k]
        fs.writeFileSync(this.data_path_map[file], JSON.stringify(this.data_map[file]));
    }

    public static getFile(k,dir:data_dir_tem_name): string {
        const p = path.join(Env.work_dir, dir, k);
        if (!this.checkFile(k,dir)) {
            return ""
        }
        return fs.readFileSync(p).toString();
    }

    public static setFile(k, v: string,dir:data_dir_tem_name) {
        const p = path.join(Env.work_dir, dir, k);
        this.checkFile(k,dir);
        fs.writeFileSync(p, v);
    }

    // 上传到临时目录下，并返回文件路径
    public static writeFileSyncTemp(filename: string,dir, data?: any) {
        const p = path.join(Env.work_dir, dir, filename);
        this.checkFile(filename,dir);
        if (data) {
            fs.writeFileSync(p, data);
        }
        return p;
    }
}


