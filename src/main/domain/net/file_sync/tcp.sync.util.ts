import path from "path";
import {tcp_proxy_sync_task_item} from "../../../../common/req/common.pojo";

export type TcpSyncEventType = "add" | "change" | "unlink" | "addDir" | "unlinkDir";

export interface TcpSyncEnvelopeHeader {
    task_id: string;
    event: TcpSyncEventType;
    relative_path: string;
    is_directory?: boolean;
    mtime?: number;
    size?: number;
    source_client_num_id: number;
    target_client_num_id: number;
}

export function normalizeSyncRelativePath(value: string) {
    return (value ?? "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function safeResolveSyncPath(root_dir: string, relative_path: string) {
    const root = path.resolve(root_dir);
    const resolved = path.resolve(root, relative_path ?? "");
    const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (resolved !== root && !resolved.startsWith(rootWithSep)) {
        throw new Error(`Invalid sync path: ${relative_path}`);
    }
    return resolved;
}

export function buildSyncEnvelope(header: TcpSyncEnvelopeHeader, payload: Buffer = Buffer.alloc(0)) {
    const headerBuffer = Buffer.from(JSON.stringify(header));
    const lenBuffer = Buffer.alloc(4);
    lenBuffer.writeUInt32BE(headerBuffer.length, 0);
    return Buffer.concat([lenBuffer, headerBuffer, payload]);
}

export function parseSyncEnvelope(buffer: Buffer) {
    if (buffer.length < 4) {
        throw new Error("Invalid sync envelope");
    }
    const headerLen = buffer.readUInt32BE(0);
    const headerStart = 4;
    const headerEnd = headerStart + headerLen;
    if (buffer.length < headerEnd) {
        throw new Error("Invalid sync envelope header length");
    }
    const header = JSON.parse(buffer.subarray(headerStart, headerEnd).toString()) as TcpSyncEnvelopeHeader;
    const payload = buffer.subarray(headerEnd);
    return {header, payload};
}

function globToRegExp(pattern: string) {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, ":::DOUBLE_STAR:::")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/:::DOUBLE_STAR:::/g, ".*");
    return new RegExp(`^${escaped}$`);
}

export function createSyncIgnoreMatcher(ignore_list: string[] = []) {
    const patterns = (ignore_list ?? [])
        .map((item) => normalizeSyncRelativePath(String(item ?? "").trim()))
        .filter(Boolean);
    const regexList = patterns
        .filter((item) => item.includes("*") || item.includes("?"))
        .map((item) => globToRegExp(item));

    return (relative_path: string, is_directory = false) => {
        const rel = normalizeSyncRelativePath(relative_path);
        if (!rel) return false;

        for (const pattern of patterns) {
            if (!pattern) continue;
            if (pattern.includes("*") || pattern.includes("?")) {
                if (regexList.some((reg) => reg.test(rel))) {
                    return true;
                }
                continue;
            }

            if (rel === pattern) {
                return true;
            }
            if (rel.startsWith(`${pattern}/`)) {
                return true;
            }
            const segments = rel.split("/");
            if (segments.includes(pattern)) {
                return true;
            }
            if (is_directory && rel === `${pattern}/`) {
                return true;
            }
        }

        return false;
    };
}


export type ChokidarWatcher = ReturnType<any>;
export type cache_file_type = { [key: number]: { mtime: number } }

// 定义队列任务项的数据结构
export interface QueueTaskItem {
    event: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
    fullPath: string;
}

// 优化的异步排队执行器：不再存储函数包裹的闭包，直接存储轻量级元数据
export class AsyncQueue {
    private queue: QueueTaskItem[] = [];
    private activeCount = 0;

    constructor(
        private concurrency: number = 1,
        private processor: (task: QueueTaskItem) => Promise<void>, // 传入外部处理器
        private next_interval = 500
    ) {}

    public push(task: QueueTaskItem) {
        this.queue.push(task);
        this.next();
    }

    public get size(): number {
        return this.queue.length;
    }

    private next() {
        // 如果当前执行中的任务数达到了最大并发限制，或者队列空了，就直接返回
        if (this.activeCount >= this.concurrency || this.queue.length === 0) {
            return;
        }

        const task = this.queue.shift();
        if (task) {
            this.activeCount++; // 占用一个并发名额

            // 动态执行外部传入的统一处理器
            this.processor(task).finally(() => {
                this.activeCount--;
                setTimeout(this.next.bind(this),this.next_interval)
                // this.next();
            }).catch(e => {
                console.error("[AsyncQueue Error]", e);
            });

            this.next();
        }
    }

    public clear() {
        this.queue = [];
        this.activeCount = 0;
    }
}

export interface SyncRuntimeState {
    task: tcp_proxy_sync_task_item;
    watcher?: ChokidarWatcher;
    ignore?: (relative_path: string, is_directory?: boolean) => boolean;
    suppress_set?: Set<string>;
    local_dir?: string;
    remote_client_id?: number;
    cache_file_map?: cache_file_type;
    cache_path?: string;
    client_num_id?: number;
    queue?: AsyncQueue;
}

/**
 * MurmurHash3 32-bit 实现，用于将路径转为高效数字
 */
export function stringToHash32(str: string): number {
    let k1: number;
    let h1 = 0x12345678; // Seed
    const bytes = Buffer.from(str, "utf-8");
    const remainder = bytes.length & 3;
    const blocks = (bytes.length - remainder) >> 2;

    for (let i = 0; i < blocks; i++) {
        const idx = i << 2;
        k1 = bytes[idx] | (bytes[idx + 1] << 8) | (bytes[idx + 2] << 16) | (bytes[idx + 3] << 24);

        k1 = Math.imul(k1, 0xcc9e2d51);
        k1 = (k1 << 15) | (k1 >>> 17);
        k1 = Math.imul(k1, 0x1b873593);

        h1 ^= k1;
        h1 = (h1 << 13) | (h1 >>> 19);
        h1 = Math.imul(h1, 5) + 0xe6546b64;
    }

    k1 = 0;
    const tailIdx = blocks << 2;
    switch (remainder) {
        case 3: k1 ^= bytes[tailIdx + 2] << 16;
        case 2: k1 ^= bytes[tailIdx + 1] << 8;
        case 1:
            k1 ^= bytes[tailIdx];
            k1 = Math.imul(k1, 0xcc9e2d51);
            k1 = (k1 << 15) | (k1 >>> 17);
            k1 = Math.imul(k1, 0x1b873593);
            h1 ^= k1;
    }

    h1 ^= bytes.length;
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;

    return h1 >>> 0; // 确保是无符号 32 位正整数
}

/**
 * 统一获取文件路径的 Hash 值
 * ⭐ 注意：使用相对路径做 Hash 可以让多端缓存逻辑更通用；
 * 如果你倾向于继续用绝对路径，可以直接传 fullPath。这里以相对路径为例。
 */
export function getFilePathHash(runtimeLocalDir: string, fullPath: string): number {
    const relative = normalizeSyncRelativePath(path.relative(runtimeLocalDir, fullPath)) || fullPath;
    return stringToHash32(relative);
}