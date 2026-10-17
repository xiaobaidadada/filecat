import {fileHttp} from "../../../../util/config";
import {getRouterAfter, getRouterPath} from "../../../../util/WebPath";
import {NotyFail} from "../../../../util/noty";

/** 保存路径：目录按段编码 + 文件名原样，与 md 保存同一套规则 */
export function get_save_path(name: string) {
    return `${encodeURIComponent(getRouterAfter("file", getRouterPath()))}${name}`;
}

/** 把已有路径的每个目录段编码，文件名保持原样（Studio 传进来的是解码后的路径） */
export function encode_path(path: string): string {
    const i = path.lastIndexOf("/");
    if (i < 0) {
        return encodeURIComponent(path);
    }
    return encodeURIComponent(path.slice(0, i)) + path.slice(i);
}

/** 下载二进制文件 */
export async function fetch_bytes(url: string): Promise<Uint8Array> {
    const res = await fetch(url, {headers: {Authorization: localStorage.getItem("token")}});
    if (!res.ok) {
        throw new Error(`读取文件失败: ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
}

/** 保存二进制文件，返回是否成功 */
export async function save_bytes(path: string, bytes: Uint8Array): Promise<boolean> {
    const rsq = await fileHttp.post(`save_bin/${path}`, {base64: to_base64(bytes)});
    if (rsq.code !== 0) {
        NotyFail(rsq.message ?? "保存失败");
        return false;
    }
    return true;
}

/** 写回文件：path 是解码后的文件路径（如 Downloads/a.xlsx） */
export function write_back(path: string, bytes: Uint8Array): Promise<boolean> {
    return save_bytes(encode_path(path), bytes);
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
