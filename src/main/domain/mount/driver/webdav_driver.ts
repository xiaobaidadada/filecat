import axios, {AxiosInstance, Method} from "axios";
import {Readable} from "stream";
import {FileDriver, DriverCaps, MountDriverType} from "./file_driver";
import {FileItemData} from "../../../../common/file.pojo";
import {getFileFormat} from "../../../../common/FileMenuType";
import {driver_item_to_file_item, norm_mount_path, mount_basename} from "./file_driver_type";

/**
 * 把挂载点内的相对路径转成 WebDAV 的绝对 URL。
 * WebDAV 的 URL 需要逐段编码，否则中文/空格会 400。
 */
function encode_webdav_path(base: string, p: string): string {
    const inner = norm_mount_path(p);
    const segments = inner.split("/").filter(v => v.length > 0).map(v => encodeURIComponent(v));
    const tail = segments.join("/");
    return tail ? `${base}/${tail}` : base;
}

/**
 * 解析 WebDAV 的 PROPFIND 响应（XML）。
 * 不引入 XML 解析库：WebDAV 的响应结构固定，用正则逐条提取 response 块足够，
 * 也避免为这一个功能新增依赖。
 */
interface PropfindEntry {
    href: string;
    name: string;
    is_dir: boolean;
    size: number;
    mtime: number;
}

function parse_propfind(xml: string, base_name: string): PropfindEntry[] {
    const out: PropfindEntry[] = [];
    // 逐个 response 块处理；(?:\r?\n|.)* 用惰性匹配到最近的 </...response>
    const response_re = /<(?:[a-zA-Z0-9]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?response>/gi;
    let m: RegExpExecArray | null;
    while ((m = response_re.exec(xml)) !== null) {
        const block = m[1];
        const href_m = /<(?:[a-zA-Z0-9]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?href>/i.exec(block);
        if (!href_m) {
            continue;
        }
        // href 是 URL 编码的，需要解码
        const href = decodeURIComponent(href_m[1].trim());
        const is_dir = /<(?:[a-zA-Z0-9]+:)?collection\b/i.test(block);
        const len_m = /<(?:[a-zA-Z0-9]+:)?getcontentlength\b[^>]*>(\d*)/i.exec(block);
        const time_m = /<(?:[a-zA-Z0-9]+:)?getlastmodified\b[^>]*>([^<]*)/i.exec(block);
        const size = len_m && len_m[1] ? parseInt(len_m[1], 10) : 0;
        const mtime = time_m ? Date.parse(time_m[1]) : 0;
        // 取最后一段作为名称（去掉结尾斜杠后再取）
        const clean = href.replace(/\/+$/, "");
        const name = clean.slice(clean.lastIndexOf("/") + 1);
        out.push({
            href,
            name,
            is_dir,
            size: Number.isFinite(size) ? size : 0,
            mtime: Number.isFinite(mtime) ? mtime : 0,
        });
    }
    // PROPFIND 返回的第一条通常是目录自身，调用方按名称过滤
    return out.filter(v => v.name !== base_name || v.href.replace(/\/+$/, "") !== "");
}

export interface WebdavConfig {
    url: string;
    username?: string;
    password?: string;
    root?: string;
}

/**
 * WebDAV 驱动。
 * WebDAV 本质是 HTTP 的一套扩展方法，用 axios 手写即可，不引入第三方 webdav 库：
 *  · PROPFIND 列目录 / 取属性
 *  · GET / PUT 读写（都支持流式，不落盘）
 *  · MKCOL 建目录
 *  · DELETE 删除
 *  · MOVE / COPY 移动复制（第二个参数 Destination 指定目标）
 */
export class WebdavDriver implements FileDriver {
    readonly type = MountDriverType.webdav;
    readonly display_name = "WebDAV";
    readonly caps: DriverCaps = {
        list: true,
        read: true,
        write: true,
        remove: true,
        mkdir: true,
        move: true,
        copy: true,
        direct_url: false,
        quota: false,
        compress: false,
        recycle: false,
        share: false,
    };

    private readonly http: AxiosInstance;
    /** WebDAV 服务根地址（含起始目录） */
    private readonly base: string;

    constructor(config: WebdavConfig) {
        if (!config?.url) {
            throw new Error("WebDAV 挂载缺少服务地址");
        }
        let url = config.url.trim().replace(/\/+$/, "");
        // 起始目录拼在服务地址后面
        const root = (config.root ?? "").trim().replace(/^\/+|\/+$/g, "");
        if (root) {
            url = `${url}/${root.split("/").map(v => encodeURIComponent(v)).join("/")}`;
        }
        this.base = url;

        const auth = config.username
            ? {username: config.username, password: config.password ?? ""}
            : undefined;
        this.http = axios.create({
            auth,
            // 不校验状态码，交给各方法自行判断（PROPFIND 常返回 207）
            validateStatus: () => true,
            timeout: 30000,
            // 允许响应体为流
            responseType: "stream",
        });
    }

    /** 发一个 WebDAV 请求；非 2xx/3xx 抛错 */
    private async request(method: string, path: string, options: {
        data?: any;
        headers?: Record<string, string>;
        responseType?: any;
        params?: Record<string, any>;
    } = {}) {
        const url = encode_webdav_path(this.base, path);
        const res = await this.http.request({
            url,
            method: method as Method,
            data: options.data,
            params: options.params,
            headers: options.headers,
            responseType: options.responseType ?? "stream",
        });
        if (res.status >= 400) {
            // 把响应体读出来（可能是错误文本），方便定位问题
            let detail = "";
            try {
                const chunks: Buffer[] = [];
                for await (const c of res.data) {
                    chunks.push(Buffer.from(c));
                    if (Buffer.concat(chunks).length > 2048) {
                        break;
                    }
                }
                detail = Buffer.concat(chunks).toString("utf8").slice(0, 300);
            } catch (e) {
                // 忽略读体失败
            }
            throw new Error(`WebDAV ${method} ${path} 失败（${res.status}）：${detail || res.statusText}`);
        }
        return res;
    }

    async list(dir: string): Promise<FileItemData[]> {
        const res = await this.request("PROPFIND", dir, {
            headers: {
                Depth: "1",
                "Content-Type": "application/xml; charset=utf-8",
            },
            data: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/>
    <d:getcontentlength/>
    <d:getlastmodified/>
  </d:prop>
</d:propfind>`,
        });
        const xml = await read_stream_to_text(res.data);
        const self_name = mount_basename(dir);
        const entries = parse_propfind(xml, self_name);
        const inner_dir = norm_mount_path(dir);
        const items: FileItemData[] = [];
        for (const e of entries) {
            // 过滤目录自身那条（名称相同且路径等于当前目录）
            const e_inner = this.href_to_inner(e.href);
            if (e_inner === inner_dir || e_inner === inner_dir + "/") {
                continue;
            }
            items.push(driver_item_to_file_item({
                name: e.name,
                path: this.href_to_inner(e.href),
                is_dir: e.is_dir,
                size: e.size,
                mtime: e.mtime,
            }, get_format));
        }
        return items;
    }

    async stat(path: string): Promise<FileItemData | null> {
        try {
            const res = await this.request("PROPFIND", path, {
                headers: {Depth: "0"},
            });
            const xml = await read_stream_to_text(res.data);
            const entries = parse_propfind(xml, mount_basename(path));
            if (!entries.length) {
                return null;
            }
            const e = entries[0];
            return driver_item_to_file_item({
                name: mount_basename(path) || e.name,
                path: norm_mount_path(path),
                is_dir: e.is_dir,
                size: e.size,
                mtime: e.mtime,
            }, get_format);
        } catch (e) {
            // 404 表示不存在
            if (/失败（404）/.test(e?.message ?? "")) {
                return null;
            }
            throw e;
        }
    }

    async read(path: string, range?: [number, number]): Promise<Readable> {
        const headers: Record<string, string> = {};
        if (range) {
            // Range 用闭区间，省略 end 时表示到末尾
            headers.Range = range[1] === undefined || range[1] === null
                ? `bytes=${range[0]}-`
                : `bytes=${range[0]}-${range[1]}`;
        }
        const res = await this.request("GET", path, {headers});
        return res.data as Readable;
    }

    async write(path: string, data: Readable, size?: number): Promise<void> {
        const headers: Record<string, string> = {
            "Content-Type": "application/octet-stream",
        };
        if (size !== undefined) {
            headers["Content-Length"] = String(size);
        }
        await this.request("PUT", path, {data, headers});
    }

    async remove(path: string): Promise<void> {
        await this.request("DELETE", path);
    }

    async mkdir(path: string): Promise<void> {
        const res = await this.http.request({
            url: encode_webdav_path(this.base, path),
            method: "MKCOL",
            validateStatus: () => true,
        });
        // 405 = 已存在，视为成功
        if (res.status >= 400 && res.status !== 405) {
            throw new Error(`创建目录失败（${res.status}）`);
        }
    }

    async move(from: string, to: string): Promise<void> {
        await this.request("MOVE", from, {
            headers: {
                Destination: encode_webdav_path(this.base, to),
                // 覆盖已存在的目标
                Overwrite: "T",
            },
        });
    }

    async copy(from: string, to: string): Promise<void> {
        await this.request("COPY", from, {
            headers: {
                Destination: encode_webdav_path(this.base, to),
                Overwrite: "T",
            },
        });
    }

    async getDirectUrl(): Promise<string | null> {
        // WebDAV 的直链需要认证，交给浏览器没用，一律走服务器中转
        return null;
    }

    async quota(): Promise<{used: number; total: number} | null> {
        return null;
    }

    /** 把 PROPFIND 返回的 href 转成挂载点内相对路径 */
    private href_to_inner(href: string): string {
        let s = href;
        // href 可能是完整 URL，也可能是路径
        try {
            if (/^https?:\/\//i.test(s)) {
                s = new URL(s).pathname;
            }
        } catch (e) {
            // 不是合法 URL，按路径处理
        }
        // 去掉 base 的路径部分
        let base_path = "";
        try {
            base_path = new URL(this.base).pathname;
        } catch (e) {
            base_path = this.base;
        }
        if (base_path && s.toLowerCase().startsWith(base_path.toLowerCase())) {
            s = s.slice(base_path.length);
        }
        return norm_mount_path(s);
    }
}

/** 把流读成文本（限制最大长度，防止异常响应撑爆内存） */
async function read_stream_to_text(stream: Readable, max = 4 * 1024 * 1024): Promise<string> {
    const chunks: Buffer[] = [];
    let len = 0;
    for await (const c of stream) {
        const buf = Buffer.from(c);
        chunks.push(buf);
        len += buf.length;
        if (len > max) {
            break;
        }
    }
    return Buffer.concat(chunks).toString("utf8");
}

/** 从文件名推断前端需要的类型（复用项目统一的判断，避免这里再维护一份后缀映射） */
function get_format(name: string) {
    return getFileFormat(name);
}
