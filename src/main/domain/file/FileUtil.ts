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

    // 文件是否都存在
    static async access_all(paths: string[]) {
        let num = 0
        for (const path of paths) {
            try {
                await fs.promises.access(path,fs.constants.F_OK);
                num++
            } catch {

            }
        }
        return num === paths.length;
    }

    static async appendFileSync(path: string,data: string | Uint8Array,
                                options?:any) {
        return fs.promises.appendFile(path,data,options)
    }

    static async writeFileSync(path: string,data: string | Uint8Array) {
        return fs.promises.writeFile(path,data)
    }


    static async writeFileSyncWithUtf8bom(path: string, data: string) {
        const BOM = '\uFEFF';
        if (!data.startsWith(BOM)) {
            data = BOM + data;
        }
        return fs.promises.writeFile(path, data, {
            encoding: 'utf8'
        });
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

    static async get_exe_path_by_env_dir(dir:string,exe_name:string) {
        if(!await this.access(dir)) {
            return  null
        }
        const stats = await this.statSync(dir)
        if(!stats.isDirectory()){
            return null
        }
        const list = await this.readdirSync(dir)
        for (const item of list) {
            if(item.startsWith(exe_name)) {
                return  path.join(dir, `${item}`);
            }
        }
        return null
    }



    static async ensure_dir(dir: string) {
        await fs.promises.mkdir(dir, { recursive: true });
    }

    static async copy_dir(
        src: string,
        dest: string,
        ignore: string[] = []
    ) {

        await this.ensure_dir(dest)

        const entries = await fs.promises.readdir(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            // 👉 忽略规则（支持文件/文件夹）
            if (ignore.includes(entry.name)) {
                continue;
            }

            if (entry.isDirectory()) {
                await this.copy_dir(srcPath, destPath, ignore);
            } else if (entry.isFile()) {
                await fs.promises.copyFile(srcPath, destPath);
            }
        }
    }

    // 递归删除目录
    static async remove_dir(targetPath: string) {

        if (!(await this.access(targetPath))) return;

        const stats = await fs.promises.stat(targetPath);

        if (stats.isFile()) {
            await fs.promises.unlink(targetPath);
            return;
        }

        const entries = await fs.promises.readdir(targetPath);

        for (const entry of entries) {
            const fullPath = path.join(targetPath, entry);
            const entryStats = await fs.promises.stat(fullPath);

            if (entryStats.isDirectory()) {
                await this.remove_dir(fullPath);
            } else {
                await fs.promises.unlink(fullPath);
            }
        }

        await fs.promises.rmdir(targetPath);
    }

    // 文件不存在的时候不返回
    static async find_max_numbered_version_file(filePath: string) {

        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        if(!await this.access(dir)) {
            return null
        }

        const files = await fs.promises.readdir(dir);

        let max = -1;
        let result: string | null = null;

        const basePath = path.join(dir, base);

        if (await this.access(basePath)) {
            result = basePath;
            max = 0;
        }

        for (const f of files) {
            if (!f.startsWith(base)) continue;

            const suffix = f.slice(base.length);

            if (suffix.length === 0) continue;

            // 提取纯数字后缀（不使用正则）
            let num = 0;
            let hasNumber = false;

            for (const c of suffix) {
                if (c >= '0' && c <= '9') {
                    num = num * 10 + (c.charCodeAt(0) - 48);
                    hasNumber = true;
                } else {
                    hasNumber = false;
                    break;
                }
            }

            if (!hasNumber) continue;

            if (num > max) {
                max = num;
                result = path.join(dir, f);
            }
        }

        return result;
    }

    // 文件名字相同的话返回新的 带数字的
    static async get_next_numbered_name(filePath: string) {

        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        if(!await this.access(dir)) {
            return filePath;
        }
        const files = await fs.promises.readdir(dir);

        let max = 0;

        const basePath = path.join(dir, base);

        const exists = await this.access(basePath);

        if (!exists) {
            return basePath;
        }

        for (const f of files) {
            if (!f.startsWith(base)) continue;

            const suffix = f.slice(base.length);
            if (!suffix) continue;

            // 解析数字
            let num = 0;
            let has = false;

            for (const c of suffix) {
                if (c >= '0' && c <= '9') {
                    num = num * 10 + (c.charCodeAt(0) - 48);
                    has = true;
                } else {
                    has = false;
                    break;
                }
            }

            if (!has) continue;

            if (num > max) {
                max = num;
            }
        }

        return path.join(dir, `${base}${max + 1}`);
    }
}

// async function test() {
//     console.log(await FileUtil.get_next_numbered_name(path.join(__dirname, 'file.service.ts')));
//     console.log(await FileUtil.find_max_numbered_version_file(path.join(__dirname, 'file.service.t1s')));
// }
// test()