import axios from "axios";
import {Readable} from "stream";
import {FileDriver, DriverCaps, MountDriverType} from "./file_driver";
import {FileItemData} from "../../../../common/file.pojo";
import {getFileFormat} from "../../../../common/FileMenuType";
import {driver_item_to_file_item, norm_mount_path, mount_join, mount_basename, mount_parent} from "./file_driver_type";
import {BaiduTokenStore} from "../baidu/baidu_token";

/** 百度网盘开放平台接口地址 */
export const BAIDU_API = {
    /** 文件列表（xpan） */
    list: "https://pan.baidu.com/rest/2.0/xpan/file",
    /** 文件信息 / 批量元数据 */
    filemetas: "https://pan.baidu.com/rest/2.0/xpan/multimedia",
    /** 下载地址（需要 access_token + 用户 UA 白名单） */
    download: "https://pan.baidu.com/rest/2.0/xpan/multimedia",
    /** 上传（预创建） */
    precreate: "https://pan.baidu.com/rest/2.0/xpan/file",
    /** 上传分片 */
    upload: "https://d.pcs.baidu.com/rest/2.0/pcs/superfile2",
    /** 创建文件 */
    create: "https://pan.baidu.com/rest/2.0/xpan/file",
    /** 文件管理（删除/移动/复制/重命名） */
    filemanager: "https://pan.baidu.com/rest/2.0/xpan/file",
    /** 用户信息 */
    uinfo: "https://pan.baidu.com/rest/2.0/xpan/nas",
    /** 容量 */
    quota: "https://pan.baidu.com/api/quota",
};

/** 百度网盘单文件上传分片大小（4MB，官方建议） */
const SLICE_SIZE = 4 * 1024 * 1024;

/** 百度网盘表示 access_token 失效的错误码（-6 无效、110 无效、111 过期） */
const TOKEN_INVALID_ERRNO = new Set([-6, 110, 111]);

export interface BaiduConfig {
    /** 百度网盘凭据 id（= 应用，含 app_key/secret_key） */
    account_key: string;
    /** 账号 id（= 百度 uk）；凭据下可挂多个账号，必须指定 */
    account_id: string;
    root?: string;
}

/**
 * 百度网盘驱动。
 *
 * 依赖「应用授权」（app_key/app_secret）拿到 access_token，见 baidu_token.ts。
 * 百度开放平台的下载接口有严格限制：拿到的直链必须带与授权时一致的 User-Agent 才能访问，
 * 且直链有效期很短，所以下载统一走服务器中转（这里用 axios 带 UA 拉流转发）。
 *
 * 一些接口差异：
 *  · 所有路径必须是绝对路径，以 / 开头
 *  · 删除/移动属异步任务，返回的 taskid 需要轮询（这里简化：不轮询，接口返回即视为已提交）
 *  · 上传必须先 precreate 拿到 uploadid 和分片 md5 列表，再逐片上传，最后 create 收尾
 */
export class BaiduDriver implements FileDriver {
    readonly type = MountDriverType.baidu;
    readonly display_name = "百度网盘";
    readonly caps: DriverCaps = {
        list: true,
        read: true,
        write: true,
        remove: true,
        mkdir: true,
        move: true,
        copy: true,
        // 百度直链需要特定 UA，浏览器拿不到，一律走服务器中转
        direct_url: false,
        quota: true,
        compress: false,
        recycle: false,
        share: false,
    };

    private readonly config: BaiduConfig;
    private readonly store: BaiduTokenStore;

    constructor(config: BaiduConfig) {
        if (!config?.account_key) {
            throw new Error("百度网盘挂载缺少凭据，请先在设置中添加并授权");
        }
        if (!config?.account_id) {
            throw new Error("百度网盘挂载缺少账号，请先选择要挂载的账号");
        }
        this.config = config;
        this.store = new BaiduTokenStore(config.account_key, config.account_id);
    }

    /** 取可用的 access_token（过期自动刷新） */
    private async token(): Promise<string> {
        return this.store.get_access_token();
    }

    /** 挂载点内相对路径 → 百度网盘的绝对路径 */
    private abs(p: string): string {
        const root = (this.config.root ?? "").trim().replace(/\/+$/, "");
        const inner = norm_mount_path(p);
        if (root) {
            return inner === "/" ? root : root + inner;
        }
        return inner;
    }

    /** 百度网盘绝对路径 → 挂载点内相对路径 */
    private inner(abs_path: string): string {
        const root = (this.config.root ?? "").trim().replace(/\/+$/, "");
        if (root && abs_path.startsWith(root)) {
            return norm_mount_path(abs_path.slice(root.length));
        }
        return norm_mount_path(abs_path);
    }

    /** 调百度接口；出错时把百度返回的 errmsg 带上，便于定位 */
    private async api(url: string, params: Record<string, any>, method: "get" | "post" = "get") {
        const data = await this.api_raw(url, params, method, await this.token());
        // 本地判断过期依赖系统时钟，不准；token 真正失效以接口返回的 errno 为准，
        // 遇到失效码就强刷一次再重试（只重试一次，避免死循环）
        if (TOKEN_INVALID_ERRNO.has(Number(data?.errno))) {
            return this.api_raw(url, params, method, await this.store.force_refresh());
        }
        return data;
    }

    private async api_raw(url: string, params: Record<string, any>, method: "get" | "post", token: string) {
        const common = {
            access_token: token,
            ...params,
        };
        try {
            const res = method === "get"
                ? await axios.get(url, {params: common, timeout: 60000})
                : await axios.post(url, null, {params: common, timeout: 60000});
            return res.data;
        } catch (e) {
            const detail = e?.response?.data?.errmsg ?? e?.message;
            throw new Error(`百度网盘接口失败：${detail}`);
        }
    }

    async list(dir: string): Promise<FileItemData[]> {
        const abs = this.abs(dir);
        const items: FileItemData[] = [];
        // 百度单次最多返回 1000 条，用 start 游标翻页取完整个目录。
        // 不传 start 时服务端按默认值返回第一页，所以这里显式从 0 开始。
        const page_size = 1000;
        let start = 0;
        while (true) {
            const data = await this.api(BAIDU_API.list, {
                method: "list",
                dir: abs,
                order: "name",
                start,
                limit: page_size,
            });
            if (data.errno) {
                throw new Error(`百度网盘列目录失败：${data.errmsg || data.errno}`);
            }
            const batch = data.list ?? [];
            for (const f of batch) {
                // isdir=2 是「应用生成的目录」，用户看不到，过滤掉
                if (f.isdir === 2) {
                    continue;
                }
                items.push(driver_item_to_file_item({
                    name: f.server_filename,
                    path: mount_join(dir, f.server_filename),
                    is_dir: f.isdir === 1,
                    size: f.isdir === 1 ? undefined : f.size,
                    // 百度的时间字段单位是秒
                    mtime: f.server_mtime ? f.server_mtime * 1000 : 0,
                }, getFileFormat));
            }
            // 不足一页说明已经取完
            if (batch.length < page_size) {
                break;
            }
            start += page_size;
        }
        return items;
    }

    async stat(path: string): Promise<FileItemData | null> {
        // 根目录直接构造：它是挂载点的起点，一定存在且一定是目录，
        // 而且没有父目录可以列，只能特判。
        if (norm_mount_path(path) === "/") {
            return driver_item_to_file_item({
                name: "",
                path: "/",
                is_dir: true,
                size: undefined,
                mtime: 0,
            }, getFileFormat);
        }
        const hit = await this.find_entry(this.abs(path));
        if (!hit) {
            return null;
        }
        return driver_item_to_file_item({
            name: hit.server_filename ?? mount_basename(path),
            path: norm_mount_path(path),
            is_dir: hit.isdir === 1,
            size: hit.isdir === 1 ? undefined : hit.size,
            mtime: hit.server_mtime ? hit.server_mtime * 1000 : 0,
        }, getFileFormat);
    }

    /**
     * 按绝对路径查一个条目（返回百度原始对象，含 fs_id / isdir / size 等）。
     *
     * 百度没有「按路径 stat」的接口，可用的办法是用 list 列「父目录」，
     * 再在返回结果里按 path 精确匹配。
     *
     * 注意不要用 method=search：它要求必须给 key（文件名关键词），
     * 拿不到根目录、且同名文件在不同层级时会匹配错。
     */
    private async find_entry(abs_path: string): Promise<any | null> {
        const parent = mount_parent(abs_path);
        const data = await this.api(BAIDU_API.list, {
            method: "list",
            dir: parent,
            limit: 1000,
        });
        if (data.errno) {
            return null;
        }
        return (data.list ?? []).find((v: any) => v.path === abs_path) ?? null;
    }

    /**
     * 读文件：先拿 dlink 再用带 UA 的请求拉流。
     * 百度的下载接口要求 User-Agent 与授权时一致（默认 pan.baidu.com），否则返回 403。
     */
    async read(path: string, range?: [number, number]): Promise<Readable> {
        const token = await this.token();
        // 1) 先用 filemetas 拿 fsid，再换 dlink
        const meta = await this.api(BAIDU_API.filemetas, {
            method: "filemetas",
            fsids: JSON.stringify([await this.fsid(path)]),
            dlink: 1,
        });
        if (meta.errno || !meta.list?.length) {
            throw new Error(`百度网盘获取文件信息失败：${meta.errmsg || meta.errno}`);
        }
        const info = meta.list[0];
        const dlink = `${info.dlink}&access_token=${token}`;
        const headers: Record<string, string> = {
            // 必须与授权时的一致
            "User-Agent": "pan.baidu.com",
        };
        if (range) {
            headers.Range = range[1] === undefined || range[1] === null
                ? `bytes=${range[0]}-`
                : `bytes=${range[0]}-${range[1]}`;
        }
        const res = await axios.get(dlink, {
            headers,
            responseType: "stream",
            timeout: 120000,
            // 百度下载会 302 跳到实际存储地址，跟随重定向
            maxRedirects: 5,
        });
        return res.data as Readable;
    }

    /** 通过路径拿 fsid（百度很多接口要 fsid 而不是路径） */
    private async fsid(path: string): Promise<number> {
        const abs = this.abs(path);
        const hit = await this.find_entry(abs);
        if (!hit) {
            throw new Error(`百度网盘找不到路径：${abs}`);
        }
        return hit.fs_id;
    }

    /**
     * 上传文件。
     * 百度要求：precreate 拿 uploadid + 分片 md5 列表 → 逐片 PUT → create 收尾。
     * 这里把整个流先收集成 Buffer 再切片（百度接口不支持未知长度的流式上传，
     * 且分片上传必须预先知道每个分片的 md5）。
     */
    async write(path: string, data: Readable, size?: number): Promise<void> {
        const abs = this.abs(path);
        const buf = await stream_to_buffer(data);
        const total = buf.length;
        const slice_count = total === 0 ? 0 : Math.ceil(total / SLICE_SIZE);

        // 1) 预创建，拿到 uploadid 和每片的 md5
        const block_list = [];
        for (let i = 0; i < slice_count; i++) {
            const start = i * SLICE_SIZE;
            const end = Math.min(start + SLICE_SIZE, total);
            block_list.push(md5(buf.slice(start, end)));
        }
        const pre = await this.api(BAIDU_API.precreate, {
            method: "precreate",
            path: abs,
            size: total,
            isdir: 0,
            autoinit: 1,
            rtype: 3,
            block_list: JSON.stringify(block_list),
        }, "post");
        if (pre.errno) {
            throw new Error(`百度网盘预创建上传失败：${pre.errmsg || pre.errno}`);
        }
        const uploadid = pre.uploadid;

        // 2) 逐片上传
        const token = await this.token();
        for (let i = 0; i < slice_count; i++) {
            const chunk = buf.slice(i * SLICE_SIZE, Math.min((i + 1) * SLICE_SIZE, total));
            await axios.post(BAIDU_API.upload, chunk, {
                params: {
                    method: "upload",
                    access_token: token,
                    type: "tmpfile",
                    path: abs,
                    uploadid,
                    partseq: i,
                },
                headers: {"Content-Type": "application/octet-stream"},
                timeout: 300000,
                maxBodyLength: Infinity,
            });
        }

        // 3) 创建文件（合并分片）
        const create = await this.api(BAIDU_API.create, {
            method: "create",
            path: abs,
            size: total,
            isdir: 0,
            rtype: 3,
            uploadid,
            block_list: JSON.stringify(block_list),
        }, "post");
        if (create.errno) {
            throw new Error(`百度网盘创建文件失败：${create.errmsg || create.errno}`);
        }
    }

    async remove(path: string): Promise<void> {
        const data = await this.api(BAIDU_API.filemanager, {
            method: "filemanager",
            opera: "delete",
            async: 0,
            filelist: JSON.stringify([this.abs(path)]),
        }, "post");
        if (data.errno) {
            throw new Error(`百度网盘删除失败：${data.errmsg || data.errno}`);
        }
    }

    async mkdir(path: string): Promise<void> {
        const data = await this.api(BAIDU_API.create, {
            method: "create",
            path: this.abs(path),
            isdir: 1,
            rtype: 3,
        }, "post");
        // 31066 = 已存在，视为成功
        if (data.errno && data.errno !== 31066) {
            throw new Error(`百度网盘创建目录失败：${data.errmsg || data.errno}`);
        }
    }

    async move(from: string, to: string): Promise<void> {
        const data = await this.api(BAIDU_API.filemanager, {
            method: "filemanager",
            opera: "move",
            async: 0,
            filelist: JSON.stringify([this.abs(from)]),
            // dest 是目标「所在目录」，不是完整目标路径
            dest: this.abs(to).replace(/\/[^/]*$/, "") || "/",
        }, "post");
        if (data.errno) {
            throw new Error(`百度网盘移动失败：${data.errmsg || data.errno}`);
        }
    }

    async copy(from: string, to: string): Promise<void> {
        const data = await this.api(BAIDU_API.filemanager, {
            method: "filemanager",
            opera: "copy",
            async: 0,
            filelist: JSON.stringify([this.abs(from)]),
            dest: this.abs(to).replace(/\/[^/]*$/, "") || "/",
        }, "post");
        if (data.errno) {
            throw new Error(`百度网盘复制失败：${data.errmsg || data.errno}`);
        }
    }

    async getDirectUrl(): Promise<string | null> {
        // 百度直链绑定 UA，浏览器无法直接使用，统一走服务器中转
        return null;
    }

    async quota(): Promise<{used: number; total: number} | null> {
        try {
            const data = await this.api(BAIDU_API.quota, {checkfree: 1, checkexpire: 1});
            if (data.errno) {
                return null;
            }
            return {
                used: data.used ?? 0,
                total: data.total ?? 0,
            };
        } catch (e) {
            return null;
        }
    }
}

/** 把流收成 Buffer（百度上传接口需要预先知道长度和分片 md5） */
async function stream_to_buffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const c of stream) {
        chunks.push(Buffer.from(c));
    }
    return Buffer.concat(chunks);
}

/** 计算 md5（十六进制小写） */
function md5(buf: Buffer): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require("crypto");
    return crypto.createHash("md5").update(buf).digest("hex");
}
