import {Readable} from "stream";
import {FileDriver, DriverCaps, MountDriverType} from "./file_driver";
import {FileItemData} from "../../../../common/file.pojo";

/**
 * SMB / Windows 共享驱动。
 *
 * 暂未实现：Node 生态里的 SMB 客户端库（smb2 / @marsaud/smb2）都是多年未维护的
 * 编译型依赖，安装和跨平台分发都有风险，因此这一版先不引入。
 *
 * 现有替代方案：Windows 共享可以先在操作系统层面映射为本地盘符（net use Z: \\host\share），
 * 再用 FileCat 的本地目录访问即可；或者通过 WebDAV/SFTP 暴露同一份内容。
 * 需要 SMB 时再单独引入依赖并实现这里的各个方法。
 */
export class SmbDriver implements FileDriver {
    readonly type = MountDriverType.smb;
    readonly display_name = "SMB 共享";
    readonly caps: DriverCaps = {
        list: false,
        read: false,
        write: false,
        remove: false,
        mkdir: false,
        move: false,
        copy: false,
        direct_url: false,
        quota: false,
        compress: false,
        recycle: false,
        share: false,
    };

    constructor(_config?: any) {
        throw new Error("SMB 挂载暂未支持：建议先将共享映射为本地盘符，或改用 WebDAV / SFTP 方式访问");
    }

    list(): Promise<FileItemData[]> {
        throw new Error("SMB 挂载暂未支持");
    }

    stat(): Promise<FileItemData | null> {
        throw new Error("SMB 挂载暂未支持");
    }

    read(): Promise<Readable> {
        throw new Error("SMB 挂载暂未支持");
    }

    write(): Promise<void> {
        throw new Error("SMB 挂载暂未支持");
    }

    remove(): Promise<void> {
        throw new Error("SMB 挂载暂未支持");
    }

    mkdir(): Promise<void> {
        throw new Error("SMB 挂载暂未支持");
    }

    move(): Promise<void> {
        throw new Error("SMB 挂载暂未支持");
    }

    copy(): Promise<void> {
        throw new Error("SMB 挂载暂未支持");
    }

    getDirectUrl(): Promise<string | null> {
        throw new Error("SMB 挂载暂未支持");
    }

    quota(): Promise<{used: number; total: number} | null> {
        throw new Error("SMB 挂载暂未支持");
    }
}
