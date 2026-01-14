import * as path from 'path';
import * as fs from 'fs'

type files_type = 'threads.work.filecat.ts'|'threads.work.filecat.js'

export class BinFileUtil {

    // 二进制文件可能存在的目录
    static base_dir = [
        path.resolve('build'), // 相对路径基于 cwd
        path.resolve('src','main','threads','filecat'), // 相对路径基于 cwd
        process.cwd(),
    ]

    // 获取二进制Bin 文件的具体位置
    public static  get_bin_path (filename:files_type) {
        return this.findFile(this.base_dir,filename)
    }

    /** 目录 -> 目录项缓存 */
    private static dirCache = new Map<string, fs.Dirent[]>();

    /** root::filename -> 结果缓存 */
    private static resultCache = new Map<string, string | null>();

    // 查找文件 full_name（递归）
    private static   findFile(
        rootDirs: string | string[],
        fileName: string,
        using_cache= true
    ): string | null {
        const roots = Array.isArray(rootDirs) ? rootDirs : [rootDirs];
        // const absRoots = roots.map(r => path.resolve(r));
        const absRoots = roots.filter( v=> fs.existsSync(v));
        const cacheKey = `${absRoots.join("|")}::${fileName}`;
        // ① 命中结果缓存
        if (this.resultCache.has(cacheKey)) {
            return this.resultCache.get(cacheKey)!;
        }
        for (const root of absRoots) {
            const found =  this.walk(root, fileName,using_cache);
            if (found) {
                this.resultCache.set(cacheKey, found);
                return found;
            }
        }
        // ② 缓存“未找到”
        this.resultCache.set(cacheKey, null);
        return null;
    }

    private static ignore_dirs = new Set<string>(['node_modules'])

    private static  walk(dir: string, fileName: string,using_cache = true): string | null {
        if (this.ignore_dirs.has(path.basename(dir))) {
            // 忽略一些较大的目录的访问
            return null
        }
        let entries: fs.Dirent[];
        // ③ 目录缓存
        if (this.dirCache.has(dir)) {
            entries = this.dirCache.get(dir)!;
        } else {
            try {
                entries =  fs.readdirSync(dir, { withFileTypes: true });
                this.dirCache.set(dir, entries);
            } catch {
                // 无权限 / 被删除 / 非目录
                return null;
            }
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            // ④ 命中文件
            if (entry.isFile() && entry.name === fileName) {
                return fullPath;
            }
            // ⑤ 递归子目录
            if (entry.isDirectory() && using_cache) {
                const found =  this.walk(fullPath, fileName);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }
}