import path from "path";
import fs from "fs";
import fse from 'fs-extra'
import {Env} from "../../../common/node/Env";
import {data_common_key, data_dir_tem_name, file_key} from "./data_type";


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

    public static init(file:file_key,default_value:string = "{}") {
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


