import * as path from 'path';
import * as fs from 'fs';

type files_type = 'threads.work.filecat.ts' | 'threads.work.filecat.js';

export class BinFileUtil {

    // 二进制文件可能存在的目录 范围从小到大 process.cwd(), // systemd 是 /build
    static base_dir = [
        path.join(__dirname,'..','..','threads','filecat'), // 本地 dev 使用
        path.join(__dirname, 'build'),
        path.join(__dirname)
    ];

    /**
     * 获取二进制文件路径
     * @param filename 文件名
     * @param maxDepth 最大递归深度（默认 5 层）
     */
    public static get_bin_path(filename: files_type, maxDepth = 20): string | null {
        return this.findFile(this.base_dir, filename, true, maxDepth);
    }

    /** 目录 -> 目录项缓存 */
    private static dirCache = new Map<string, fs.Dirent[]>();

    /** root::filename::depth -> 结果缓存 */
    private static resultCache = new Map<string, string | null>();

    /** 忽略扫描的目录 */
    private static ignore_dirs = new Set<string>(['node_modules']);

    /**
     * 查找文件
     */
    private static findFile(
        rootDirs: string | string[],
        fileName: string,
        using_cache = true,
        maxDepth = Infinity
    ): string | null {

        const roots = Array.isArray(rootDirs) ? rootDirs : [rootDirs];

        // 只保留存在的目录
        const absRoots = roots.filter(v => fs.existsSync(v));

        const cacheKey = `${absRoots.join("|")}::${fileName}::${maxDepth}`;

        // 命中缓存
        if (this.resultCache.has(cacheKey)) {
            return this.resultCache.get(cacheKey)!;
        }

        for (const root of absRoots) {
            const found = this.walk(root, fileName, using_cache, 0, maxDepth);

            if (found) {
                this.resultCache.set(cacheKey, found);
                return found;
            }
        }

        this.resultCache.set(cacheKey, null);
        return null;
    }

    /**
     * 递归遍历目录
     */
    private static walk(
        dir: string,
        fileName: string,
        using_cache = true,
        currentDepth = 0,
        maxDepth = Infinity
    ): string | null {

        // 深度限制
        if (currentDepth > maxDepth) {
            return null;
        }

        if (this.ignore_dirs.has(path.basename(dir))) {
            return null;
        }

        let entries: fs.Dirent[];

        // 目录缓存
        if (using_cache && this.dirCache.has(dir)) {
            entries = this.dirCache.get(dir)!;
        } else {
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });

                if (using_cache) {
                    this.dirCache.set(dir, entries);
                }

            } catch {
                // 无权限 / 非目录 / 被删除
                return null;
            }
        }

        for (const entry of entries) {

            const fullPath = path.join(dir, entry.name);

            // 命中文件
            if (entry.isFile() && entry.name === fileName) {
                return fullPath;
            }

            // 递归子目录
            if (entry.isDirectory()) {

                const found = this.walk(
                    fullPath,
                    fileName,
                    using_cache,
                    currentDepth + 1,
                    maxDepth
                );

                if (found) return found;
            }
        }

        return null;
    }

    /**
     * 清理缓存（可选工具）
     */
    public static clearCache() {
        this.dirCache.clear();
        this.resultCache.clear();
    }
}
