import path from "path";
import fs from "fs";
import fse from 'fs-extra'
import {Env} from "../../../common/Env";

export class DataUtil {

    private static data_path = "";
    private static data = {};

    private static init() {
        if (this.data_path === "") {
            // @ts-ignore
            this.data_path = path.join(Env.work_dir, "data.json");
            if (!fs.existsSync(this.data_path)) {
                // @ts-ignore 检查某个目录是否存在
                fse.ensureDir(Env.work_dir)
                fs.writeFileSync(this.data_path, "{}");
            } else {
                this.data = JSON.parse(fs.readFileSync(this.data_path).toString());
            }
        }
    }

    private static checkFile(k,dir) {
        const p = path.join(Env.work_dir, dir, k);
        if (!fs.existsSync(p)) {
            // @ts-ignore 检查某个目录是否存在
            fse.ensureDir( path.join(Env.work_dir, dir));
            fs.writeFileSync(p, "");
            return false;
        }
        return true;
    }

    public static get<T>(k): T {
        this.init();
        return this.data[k];
    }

    public static set(k, v) {
        this.init();
        this.data[k] = v;
        fs.writeFileSync(this.data_path, JSON.stringify(this.data));
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
    public static writeFileSyncTemp(file: string,dir, data: any) {
        const p = path.join(Env.work_dir, dir, file);
        this.checkFile(file,dir);
        fs.writeFileSync(p, data);
        return p;
    }
}


