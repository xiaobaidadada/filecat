import fs, {PathLike} from "fs";
import path from "path";
import {Mode} from "node:fs";

export class FileUtil {

    static async statSync (path: string) {
        return fs.promises.stat(path)
    }

    static async readdirSync (path: string) {
        return fs.promises.readdir(path);
    }

    static async readFileSync (path: string) {
        return fs.promises.readFile(path);
    }

    static async open(path:string,flags?: string | number, mode?: Mode) {
        return fs.promises.open(path,flags,mode);
    }

    // 判断文件是否存在
    static async access(path: string) {
        try {
            await fs.promises.access(path,fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    static async appendFileSync(path: string,data: string | Uint8Array,
                                options?:any) {
        return fs.promises.appendFile(path,data,options)
    }

    static async writeFileSync(path: string,data: string | Uint8Array) {
        return fs.promises.writeFile(path,data)
    }

    static async truncateSync(path: string) {
        return fs.promises.truncate(path);
    }

    static async unlinkSync(path: string) {
        return fs.promises.unlink(path);
    }

    static async mkdirSync(path: string,param) {
        return fs.promises.mkdir(path,param);
    }

    static async renameSync(oldPath: PathLike, newPath: PathLike) {
        return fs.promises.rename(oldPath, newPath);
    }

    static async getUniqueFileName(filePath: string) {
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);

        let newFilePath = filePath;
        let count = 1;

        while (await this.access(newFilePath)) {
            newFilePath = path.join(dir, `${baseName}(${count})${ext}`);
            count++;
        }

        return newFilePath;
    }
}