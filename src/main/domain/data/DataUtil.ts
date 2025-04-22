import path from "path";
import fs from "fs";
import fse from 'fs-extra'
import {Env} from "../../../common/Env";
import {
    data_common_key,
    data_dir_tem_name,
    data_version_type,
    file_key,
    is_data_version_type
} from "./data_type";
import {FileUtil} from "../file/FileUtil";


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
            const version = this.get_data_version();
            if(version === data_version_type.filecat_not) {
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
                const  p_v = path.join(Env.work_dir, file_key.data_version)
                fs.writeFileSync(p_v, `${data_version_type.filecat_1}`);
            }
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

    public static set(k, v, file:file_key = file_key.data) {
        this.init(file);
        this.data_map[file][k] = v;
        FileUtil.writeFileSync(this.data_path_map[file], JSON.stringify(this.data_map[file])).catch(err=>{
            console.log(`数据持久化错误`,err)
        });
        // fs.writeFileSync(this.data_path_map[file], JSON.stringify(this.data_map[file]));
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


