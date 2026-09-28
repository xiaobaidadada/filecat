import {Readable} from "stream";
import {FileDriver, DriverCaps, MountDriverType} from "./file_driver";
import {FileItemData} from "../../../../common/file.pojo";
import {getFileFormat} from "../../../../common/FileMenuType";
import {driver_item_to_file_item, norm_mount_path, mount_join, mount_basename} from "./file_driver_type";

/** 动态加载 S3 SDK：打包版把它作为 external，不能静态 import */
function load_s3(): any {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require("@aws-sdk/client-s3");
    } catch (e) {
        throw new Error("S3 驱动不可用：未安装 @aws-sdk/client-s3");
    }
}

export interface S3Config {
    endpoint: string;
    bucket: string;
    region?: string;
    access_key: string;
    secret_key: string;
    root?: string;
    /** 填 1 开启强制路径风格（MinIO 等自建服务通常需要） */
    force_path_style?: string;
}

/**
 * S3 兼容对象存储驱动。
 * 适配 AWS S3 / 阿里云 OSS / 腾讯云 COS / MinIO / Cloudflare R2 等。
 *
 * 注意 S3 的「目录」是伪目录（靠 Key 前缀模拟），所以：
 *  · 列目录要用 Delimiter="/" 才能得到「直接子项」而不是整个前缀下的所有对象
 *  · 没有原生 move / rename，用 copy + delete 实现
 *  · 没有真正的空目录
 */
export class S3Driver implements FileDriver {
    readonly type = MountDriverType.s3;
    readonly display_name = "S3 对象存储";
    readonly caps: DriverCaps = {
        list: true,
        read: true,
        write: true,
        remove: true,
        // 伪目录：建一个以 / 结尾的空对象来表示
        mkdir: true,
        // 无原生移动，用 copy+delete 兜底
        move: true,
        copy: true,
        direct_url: true,
        quota: false,
        compress: false,
        recycle: false,
        share: false,
    };

    private readonly config: S3Config;
    private _client: any = null;
    private _sdk: any = null;
    /** 起始目录作为 Key 前缀 */
    private readonly prefix: string;

    constructor(config: S3Config) {
        if (!config?.endpoint || !config?.bucket || !config?.access_key) {
            throw new Error("S3 挂载缺少服务地址、存储桶或 AccessKey");
        }
        this.config = config;
        const root = (config.root ?? "").trim().replace(/^\/+|\/+$/g, "");
        this.prefix = root ? root + "/" : "";
    }

    private get sdk(): any {
        if (!this._sdk) {
            this._sdk = load_s3();
        }
        return this._sdk;
    }

    private get client(): any {
        if (!this._client) {
            const {S3Client} = this.sdk;
            this._client = new S3Client({
                endpoint: this.config.endpoint,
                region: this.config.region || "us-east-1",
                credentials: {
                    accessKeyId: this.config.access_key,
                    secretAccessKey: this.config.secret_key,
                },
                forcePathStyle: this.config.force_path_style === "1"
                    || this.config.force_path_style === "true",
            });
        }
        return this._client;
    }

    dispose(): void {
        try {
            this._client?.destroy?.();
        } catch (e) {
            // ignore
        }
        this._client = null;
    }

    /** 挂载点内相对路径 → S3 Key（不含 bucket） */
    private key(p: string): string {
        const inner = norm_mount_path(p).replace(/^\/+/, "");
        return this.prefix + inner;
    }

    /** S3 Key → 挂载点内相对路径 */
    private inner(key: string): string {
        let s = key;
        if (this.prefix && s.startsWith(this.prefix)) {
            s = s.slice(this.prefix.length);
        }
        return norm_mount_path(s);
    }

    async list(dir: string): Promise<FileItemData[]> {
        const {ListObjectsV2Command} = this.sdk;
        const prefix = this.key(dir);
        // 目录本身要把前缀补上 "/"，否则 /abc 会和 /abcd 混在一起
        const list_prefix = prefix === "" ? "" : (prefix.endsWith("/") ? prefix : prefix + "/");

        const out: FileItemData[] = [];
        const seen_dir = new Set<string>();
        let token: string | undefined = undefined;
        // 分页拉取，S3 单次最多 1000 条
        do {
            const res: any = await this.client.send(new ListObjectsV2Command({
                Bucket: this.config.bucket,
                Prefix: list_prefix,
                Delimiter: "/",
                ContinuationToken: token,
            }));
            // 子目录（CommonPrefixes）
            for (const cp of res.CommonPrefixes ?? []) {
                const full: string = cp.Prefix ?? "";
                const name = full.replace(list_prefix, "").replace(/\/$/, "");
                if (!name || seen_dir.has(name)) {
                    continue;
                }
                seen_dir.add(name);
                out.push(driver_item_to_file_item({
                    name,
                    path: mount_join(dir, name),
                    is_dir: true,
                }, getFileFormat));
            }
            // 文件
            for (const obj of res.Contents ?? []) {
                const full: string = obj.Key ?? "";
                // 跳过「目录占位对象」自身（以 / 结尾的零字节对象)
                if (full.endsWith("/")) {
                    continue;
                }
                const name = full.replace(list_prefix, "");
                if (!name || name.includes("/")) {
                    continue;
                }
                out.push(driver_item_to_file_item({
                    name,
                    path: mount_join(dir, name),
                    is_dir: false,
                    size: obj.Size ?? 0,
                    mtime: obj.LastModified ? new Date(obj.LastModified).getTime() : 0,
                }, getFileFormat));
            }
            token = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (token);

        return out;
    }

    async stat(path: string): Promise<FileItemData | null> {
        const {HeadObjectCommand, ListObjectsV2Command} = this.sdk;
        const name = mount_basename(path);
        // 先按对象试
        try {
            const head: any = await this.client.send(new HeadObjectCommand({
                Bucket: this.config.bucket,
                Key: this.key(path),
            }));
            return driver_item_to_file_item({
                name,
                path: norm_mount_path(path),
                is_dir: false,
                size: head.ContentLength ?? 0,
                mtime: head.LastModified ? new Date(head.LastModified).getTime() : 0,
            }, getFileFormat);
        } catch (e) {
            // 不是对象，按目录试：前缀下有东西就算目录
            const prefix = this.key(path);
            const list_prefix = prefix.endsWith("/") ? prefix : prefix + "/";
            const res: any = await this.client.send(new ListObjectsV2Command({
                Bucket: this.config.bucket,
                Prefix: list_prefix,
                MaxKeys: 1,
            }));
            const has = (res.KeyCount ?? 0) > 0 || (res.Contents?.length ?? 0) > 0
                || (res.CommonPrefixes?.length ?? 0) > 0;
            if (!has) {
                return null;
            }
            return driver_item_to_file_item({
                name,
                path: norm_mount_path(path),
                is_dir: true,
            }, getFileFormat);
        }
    }

    async read(path: string, range?: [number, number]): Promise<Readable> {
        const {GetObjectCommand} = this.sdk;
        const params: any = {
            Bucket: this.config.bucket,
            Key: this.key(path),
        };
        if (range) {
            params.Range = range[1] === undefined || range[1] === null
                ? `bytes=${range[0]}-`
                : `bytes=${range[0]}-${range[1]}`;
        }
        const res: any = await this.client.send(new GetObjectCommand(params));
        return res.Body as Readable;
    }

    async write(path: string, data: Readable, size?: number): Promise<void> {
        const {PutObjectCommand} = this.sdk;
        await this.client.send(new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: this.key(path),
            Body: data,
            ContentLength: size,
        }));
    }

    async remove(path: string): Promise<void> {
        const {DeleteObjectCommand, ListObjectsV2Command} = this.sdk;
        const key = this.key(path);
        // 先尝试当对象删
        const st = await this.stat(path);
        if (!st) {
            return;
        }
        if (st.type !== "folder" as any) {
            await this.client.send(new DeleteObjectCommand({
                Bucket: this.config.bucket,
                Key: key,
            }));
            return;
        }
        // 目录：列出前缀下所有对象逐个删（S3 没有目录概念）
        const list_prefix = key.endsWith("/") ? key : key + "/";
        let token: string | undefined = undefined;
        do {
            const res: any = await this.client.send(new ListObjectsV2Command({
                Bucket: this.config.bucket,
                Prefix: list_prefix,
                ContinuationToken: token,
            }));
            for (const obj of res.Contents ?? []) {
                await this.client.send(new DeleteObjectCommand({
                    Bucket: this.config.bucket,
                    Key: obj.Key,
                }));
            }
            token = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (token);
    }

    async mkdir(path: string): Promise<void> {
        // S3 用「以 / 结尾的空对象」代表目录
        const {PutObjectCommand} = this.sdk;
        const key = this.key(path);
        await this.client.send(new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key.endsWith("/") ? key : key + "/",
            Body: "",
        }));
    }

    /** S3 无原生移动：copy + delete */
    async move(from: string, to: string): Promise<void> {
        await this.copy(from, to);
        await this.remove(from);
    }

    /** S3 原生复制 */
    async copy(from: string, to: string): Promise<void> {
        const {CopyObjectCommand, ListObjectsV2Command} = this.sdk;
        const src = await this.stat(from);
        if (!src) {
            throw new Error("源路径不存在");
        }
        const src_key = this.key(from);
        const dst_key = this.key(to);
        if (src.type !== "folder" as any) {
            await this.client.send(new CopyObjectCommand({
                Bucket: this.config.bucket,
                // CopySource 需要 "bucket/key" 形式，key 要 URL 编码
                CopySource: `${this.config.bucket}/${encodeURIComponent(src_key).replace(/%2F/g, "/")}`,
                Key: dst_key,
            }));
            return;
        }
        // 目录：递归复制前缀下所有对象
        const list_prefix = src_key.endsWith("/") ? src_key : src_key + "/";
        const dst_prefix = dst_key.endsWith("/") ? dst_key : dst_key + "/";
        let token: string | undefined = undefined;
        do {
            const res: any = await this.client.send(new ListObjectsV2Command({
                Bucket: this.config.bucket,
                Prefix: list_prefix,
                ContinuationToken: token,
            }));
            for (const obj of res.Contents ?? []) {
                const rel = obj.Key.slice(list_prefix.length);
                await this.client.send(new CopyObjectCommand({
                    Bucket: this.config.bucket,
                    CopySource: `${this.config.bucket}/${encodeURIComponent(obj.Key).replace(/%2F/g, "/")}`,
                    Key: dst_prefix + rel,
                }));
            }
            token = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (token);
    }

    /**
     * 生成预签名直链，让浏览器直连对象存储下载。
     * 这样大文件下载完全不消耗服务器带宽。
     */
    async getDirectUrl(path: string): Promise<string | null> {
        try {
            const {getSignedUrl} = require("@aws-sdk/s3-request-presigner");
            const {GetObjectCommand} = this.sdk;
            return await getSignedUrl(this.client, new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: this.key(path),
            }), {expiresIn: 3600});
        } catch (e) {
            // 没装 presigner 时降级为服务器中转
            return null;
        }
    }

    async quota(): Promise<{used: number; total: number} | null> {
        // 对象存储没有统一的容量查询接口，各家差异大，一律不支持
        return null;
    }
}
