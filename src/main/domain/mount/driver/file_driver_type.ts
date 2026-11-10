import {FileItemData, FileTypeEnum} from "../../../../common/file.pojo";

/**
 * 驱动读取目录后返回的原始项。
 * 各驱动的原始字段差异很大（大小写、时间格式、类型字段），
 * 在驱动内部就统一成这个结构，业务层不用再适配。
 */
export interface DriverFileItem {
    name: string;
    /** 挂载点内的相对路径，以 / 开头 */
    path: string;
    is_dir: boolean;
    size?: number;
    /** 修改时间（毫秒时间戳） */
    mtime?: number;
    /** 符号链接（本地驱动才有意义） */
    is_link?: boolean;
}

/**
 * 把驱动原始项转成前端用的 FileItemData。
 * path 保留「挂载点内相对路径」，由上层再拼上挂载点前缀。
 */
export function driver_item_to_file_item(
    item: DriverFileItem,
    get_format: (name: string) => FileTypeEnum
): FileItemData {
    return {
        type: item.is_dir ? FileTypeEnum.folder : get_format(item.name),
        name: item.name,
        mtime: item.mtime ?? 0,
        size: item.size,
        isLink: item.is_link,
        path: item.path,
    };
}

/** 规范化挂载点内路径：统一成以 / 开头、无结尾斜杠的形式 */
export function norm_mount_path(p: string): string {
    if (!p) {
        return "/";
    }
    let s = p.replace(/\\/g, "/");
    if (!s.startsWith("/")) {
        s = "/" + s;
    }
    // 去掉结尾多余的斜杠（根目录除外）
    while (s.length > 1 && s.endsWith("/")) {
        s = s.slice(0, -1);
    }
    return s;
}

/** 取父目录路径 */
export function mount_parent(p: string): string {
    const s = norm_mount_path(p);
    if (s === "/") {
        return "/";
    }
    const i = s.lastIndexOf("/");
    return i <= 0 ? "/" : s.slice(0, i);
}

/** 取路径最后一段名称 */
export function mount_basename(p: string): string {
    const s = norm_mount_path(p);
    if (s === "/") {
        return "";
    }
    return s.slice(s.lastIndexOf("/") + 1);
}

/** 拼路径 */
export function mount_join(a: string, b: string): string {
    return norm_mount_path(norm_mount_path(a) + "/" + b);
}

