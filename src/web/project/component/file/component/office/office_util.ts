import {fileHttp} from "../../../../util/config";
import {Http} from "../../../../util/http";
import {getRouterAfter, getRouterPath} from "../../../../util/WebPath";
import {NotyFail, NotySuccess} from "../../../../util/noty";

/**
 * 当前文件在 URL 里的目录部分（已解码，末尾带 /）。
 *
 * getRouterAfter 拿到的路径仍是 URL 编码状态（中文目录就是 %E6%B5%8B...），
 * 必须先解码再交给 encode_path，否则会被二次编码成 %25E6...，后端按这个
 * 路径找不到文件，保存直接 404。
 */
export function get_dir_path() {
    const raw = getRouterAfter("file", getRouterPath());
    let dir: string;
    try {
        dir = decodeURIComponent(raw);
    } catch {
        // URL 里含 % 但不是合法编码，按原样用
        dir = raw;
    }
    return dir.endsWith("/") ? dir : `${dir}/`;
}

/** 保存路径：目录按段编码 + 文件名原样，与 md 保存同一套规则 */
export function get_save_path(name: string) {
    return `${encodeURIComponent(get_dir_path())}${name}`;
}

/** 把已有路径的每个目录段编码，文件名保持原样 */
export function encode_path(path: string): string {
    const i = path.lastIndexOf("/");
    if (i < 0) {
        return encodeURIComponent(path);
    }
    return encodeURIComponent(path.slice(0, i)) + path.slice(i);
}

/** 下载二进制文件 */
export async function fetch_bytes(url: string): Promise<Uint8Array> {
    return Http.get_bytes_url(url);
}

/**
 * 保存二进制文件，返回是否成功。
 * ok_text 为保存成功后要提示的文本；自动保存时由调用方传空串跳过提示。
 */
export async function save_bytes(path: string, bytes: Uint8Array, ok_text: string): Promise<boolean> {
    const rsq = await fileHttp.post(`save_bin/${path}`, {base64: to_base64(bytes)});
    if (rsq.code !== 0) {
        NotyFail(rsq.message ?? "保存失败");
        return false;
    }
    if (ok_text) {
        NotySuccess(ok_text);
    }
    return true;
}

/** 写回文件：path 是解码后的文件路径（如 Downloads/a.xlsx） */
export function write_back(path: string, bytes: Uint8Array, ok_text: string): Promise<boolean> {
    return save_bytes(encode_path(path), bytes, ok_text);
}

/** Uint8Array -> base64，分块避免超长字符串参数导致爆栈 */
export function to_base64(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}
