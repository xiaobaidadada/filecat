import {Readable} from "stream";
import {FileItemData} from "../../../../common/file.pojo";

/**
 * 驱动能力声明 —— 网盘/协议的能力差异很大（比如 S3 没有原生的移动、WebDAV 没有原生复制），
 * 用一张能力表统一描述，业务层据此决定「这个操作能不能做」，
 * 而不是在每个驱动里写一堆 if，也不用让业务层去 instanceof 判断驱动类型。
 */
export interface DriverCaps {
    /** 读目录 */
    list: boolean;
    /** 读文件内容（支持 range） */
    read: boolean;
    /** 写文件（流式，不落盘） */
    write: boolean;
    /** 删除 */
    remove: boolean;
    /** 新建目录 */
    mkdir: boolean;
    /** 移动 / 重命名 */
    move: boolean;
    /** 复制（无原生复制的驱动可用 读+写 兜底，见 FileDriver.copy 默认实现） */
    copy: boolean;
    /** 能否拿到直链（拿到就让浏览器直连网盘，不消耗服务器带宽） */
    direct_url: boolean;
    /** 能否查询容量 */
    quota: boolean;
    /** 压缩 / 解压（网盘一律不支持，只能服务器中转，故统一声明为 false） */
    compress: boolean;
    /** 回收站（网盘无此概念） */
    recycle: boolean;
    /** 分享（只有网盘自家有分享，无法统一抽象） */
    share: boolean;
}

/** 挂载驱动类型的枚举值 */
export enum MountDriverType {
    local = "local",
    webdav = "webdav",
    sftp = "sftp",
    smb = "smb",
    s3 = "s3",
    baidu = "baidu",
}

/**
 * 统一的文件驱动接口。
 * 本地磁盘和各类网盘都实现它，业务层只依赖这个接口，
 * 从而做到「挂载目录和本地目录走同一套代码路径」。
 *
 * 约定：
 *  - path 一律是「挂载点内部的相对路径」，以 / 开头，驱动内部自行拼接各自的根；
 *    这样业务层不需要关心各网盘根目录的差异。
 *  - 所有返回的 FileItemData.path 也是「挂载点内相对路径」，
 *    由上层负责拼上挂载点前缀还给前端。
 */
export interface FileDriver {
    /** 驱动类型 */
    readonly type: MountDriverType;
    /** 能力声明 */
    readonly caps: DriverCaps;
    /** 展示用的驱动名 */
    readonly display_name: string;

    /** 列目录（返回该目录下直接子项，不递归） */
    list(dir: string): Promise<FileItemData[]>;

    /** 文件/目录信息；不存在返回 null */
    stat(path: string): Promise<FileItemData | null>;

    /** 读文件，range 为 [start, end]（闭区间，end 可省略表示到末尾） */
    read(path: string, range?: [number, number]): Promise<Readable>;

    /** 写文件（流式转发，不落服务器磁盘） */
    write(path: string, data: Readable, size?: number): Promise<void>;

    /** 删除文件或目录 */
    remove(path: string): Promise<void>;

    /** 新建目录 */
    mkdir(path: string): Promise<void>;

    /** 移动 / 重命名 */
    move(from: string, to: string): Promise<void>;

    /** 复制；无原生复制的驱动走「读 + 写」兜底 */
    copy(from: string, to: string): Promise<void>;

    /** 获取直链，拿不到返回 null（调用方回退到服务器中转） */
    getDirectUrl(path: string): Promise<string | null>;

    /** 查询容量，不支持返回 null */
    quota(): Promise<{used: number; total: number} | null>;
}

/**
 * 操作不被驱动支持时抛的统一错误。
 * 后端捕获后原样把 message 返回给前端，前端不用专门适配。
 */
export class DriverNotSupportError extends Error {
    constructor(driver_name: string, action: string) {
        super(`当前挂载（${driver_name}）不支持「${action}」操作`);
        this.name = "DriverNotSupportError";
    }
}

/**
 * 校验某个能力，不支持直接抛错。
 * 各驱动在每个方法开头调用，避免写重复的 if。
 */
export function require_cap(
    driver: {type: MountDriverType; display_name: string; caps: DriverCaps},
    cap: keyof DriverCaps,
    action_name: string
): void {
    if (!driver.caps[cap]) {
        throw new DriverNotSupportError(driver.display_name, action_name);
    }
}
