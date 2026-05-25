import path from "path";

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
