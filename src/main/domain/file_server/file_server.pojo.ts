/**
 * 文件服务（把本地目录以某种协议对外提供）。
 *
 * 与 file_mount 正好相反：挂载是「把远端内容接进本地目录」，
 * 文件服务是「把本地目录暴露给远端客户端」。
 *
 * 三种协议的配置差异很大，所以用 type 区分，各自的字段集中在一个
 * 扁平结构里，不做到嵌套 —— 协议之间没有可复用的子结构。
 */

/** 支持对外提供服务的协议 */
export enum FileServerType {
    smb = "smb",
    webdav = "webdav",
    sftp = "sftp",
}

/** 一条文件服务配置 */
export interface FileServerItem {
    /** 唯一 id */
    id: string;
    /** 协议类型 */
    type: FileServerType;
    /** 备注，便于在列表里辨认 */
    note: string;

    /** 是否启用；停用后释放监听端口 */
    enabled: boolean;
    /** 监听端口（三种协议都必须独立端口） */
    port: number;
    /** 对外提供的本机目录绝对路径 */
    root_path: string;
    /** 只读模式：拒绝一切写操作 */
    readonly: boolean;

    // ---------- SFTP ----------
    /** 登录用户名 */
    sftp_username?: string;
    /** 登录密码 */
    sftp_password?: string;

    // ---------- WebDAV ----------
    /** 登录用户名 */
    webdav_username?: string;
    /** 登录密码 */
    webdav_password?: string;

    // ---------- SMB ----------
    /** 共享名（客户端访问 \\host\share_name） */
    smb_share_name?: string;
    /** 服务端显示的主机名 */
    smb_hostname?: string;

    /** 创建者用户 id */
    user_id?: string;
    /** 创建时间 */
    created_at?: number;
}

/** 服务运行状态 */
export interface FileServerState {
    /** 是否正在监听 */
    running: boolean;
    /** 实际监听端口 */
    port: number;
    /** 运行错误信息；正常时为空 */
    error?: string;
}

/**
 * 各协议必填字段校验。
 * 返回错误信息，校验通过返回 null。
 */
export function validate_file_server(item: Partial<FileServerItem>): string | null {
    if (!item.type) {
        return "type is required";
    }
    if (!item.port || item.port < 1 || item.port > 65535) {
        return "port must be between 1 and 65535";
    }
    if (!item.root_path) {
        return "root_path is required";
    }

    if (item.type === FileServerType.sftp) {
        if (!item.sftp_username) {
            return "sftp_username is required";
        }
        if (!item.sftp_password) {
            return "sftp_password is required";
        }
    }

    if (item.type === FileServerType.webdav) {
        if (!item.webdav_username) {
            return "webdav_username is required";
        }
        if (!item.webdav_password) {
            return "webdav_password is required";
        }
    }

    if (item.type === FileServerType.smb) {
        if (!item.smb_share_name) {
            return "smb_share_name is required";
        }
    }

    return null;
}
