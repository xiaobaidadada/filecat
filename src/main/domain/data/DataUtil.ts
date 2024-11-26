import path from "path";
import fs from "fs";
import fse from 'fs-extra'
import {Env} from "../../../common/Env";
export enum file_key {
    data = "data",
    systemd = "systemd"
}
export class DataUtil {
    private static data_path_map = {};
    private static data_map = {};

    // private static data_path = "";
    // private static data = {};

    private static init(file:file_key) {
        let value = this.data_path_map[file];
        if (value === undefined || value=== null) {
            this.data_path_map[file] = value = path.join(Env.work_dir, "data.json");
            if (!fs.existsSync(value)) {
                fse.ensureDirSync(Env.work_dir)
                fs.writeFileSync(value, "{}");
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

    public static get<T>(k, file:file_key = file_key.data): T {
        this.init(file);
        return this.data_map[file][k];
    }

    public static set(k, v, file:file_key = file_key.data) {
        this.init(file);
        this.data_map[file][k] = v;
        fs.writeFileSync(this.data_path_map[file], JSON.stringify(this.data_map[file]));
    }

    public static getFile(k): string {
        const p = path.join(Env.work_dir, "datafile", k);
        if (!this.checkFile(k,"datafile")) {
            return ""
        }
        return fs.readFileSync(p).toString();
    }

    public static setFile(k, v: string) {
        const p = path.join(Env.work_dir, "datafile", k);
        this.checkFile(k,"datafile");
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


