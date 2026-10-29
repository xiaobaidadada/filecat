/**
 * 文件读取状态记录：判断模型读过的文件之后有没有被外部改动过。
 *
 * 两层结构：session_id -> file_path -> 状态。
 * 按会话分桶的好处是会话结束时能整体清掉，不会让不同会话互相影响，
 * 也不会让内存随会话数量无限增长。
 *
 * 保存读取时的文件内容，用于精确判断「文件是否真的变了」：
 * 只比 mtime 的话，编辑器保存、git checkout、云同步这类 touch 行为
 * 会导致误报，逼模型无谓地重读一次。
 */

export interface file_read_state {
    /** 读取时的文件内容 */
    content: string;
    /** 读取时的修改时间戳 */
    timestamp: number;
    /** 读取时的文件字节数 */
    size: number;
    /** 读取时的起始行，undefined 表示读了全文 */
    offset?: number;
    /** 读取时的行数限制，undefined 表示读了全文 */
    limit?: number;
}

/** 每个会话最多记录的文件数，超出淘汰最早写入的 */
const MAX_FILES_PER_SESSION = 200;

// 会话 ID -> (规范化路径 -> 状态)
// 内层用 Map 保持插入顺序，便于超限时淘汰最早的条目
const session_cache = new Map<string, Map<string, file_read_state>>();

/** 统一路径 key，避免 ./ 与 /、Windows 下 \ 与 / 混用导致命中失败 */
function normalize_key(file_path: string): string {
    return file_path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/** 取（或创建）某会话的缓存桶 */
function get_bucket(session_id: string): Map<string, file_read_state> {
    let bucket = session_cache.get(session_id);
    if (!bucket) {
        bucket = new Map();
        session_cache.set(session_id, bucket);
    }
    return bucket;
}

function set_state(session_id: string, file_path: string, state: file_read_state): void {
    const bucket = get_bucket(session_id);
    const key = normalize_key(file_path);
    // 已存在先删掉，保证重新插入后位于 Map 末尾
    bucket.delete(key);
    bucket.set(key, state);
    // 超限时淘汰最早写入的
    while (bucket.size > MAX_FILES_PER_SESSION) {
        const oldest = bucket.keys().next().value;
        if (oldest === undefined) break;
        bucket.delete(oldest);
    }
}

/** 记录一次文件读取 */
export function mark_file_read(session_id: string, file_path: string, state: file_read_state): void {
    set_state(session_id, file_path, state);
}

/** 取某文件的读取记录 */
export function get_file_read_state(session_id: string, file_path: string): file_read_state | undefined {
    return session_cache.get(session_id)?.get(normalize_key(file_path));
}

/** 文件被写过之后更新记录，避免紧接着的第二次编辑被误判为过期 */
export function update_file_after_write(session_id: string, file_path: string, content: string, timestamp: number, size: number): void {
    set_state(session_id, file_path, {
        content,
        timestamp,
        size,
        offset: undefined,
        limit: undefined,
    });
}

/**
 * 清空某个会话的全部记录。
 * 由 chat.core.ts 在每轮对话结束（endOnce）时调用，
 * 与后台进程、sleep 的清理放在一起，保证会话级别的资源统一释放。
 */
export function clear_session_file_state(session_id: string): void {
    session_cache.delete(session_id);
}
