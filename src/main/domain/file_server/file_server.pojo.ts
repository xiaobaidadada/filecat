/**
 * 文件服务（把本地目录以某种协议对外提供）。
 *
 * 与 file_mount 正好相反：挂载是「把远端内容接进本地目录」，
 * 文件服务是「把本地目录暴露给远端客户端」。
 *
 * 三种协议对「共享」的定义完全不同，因此各自有独立的子结构，
 * 不做字段复用 —— 一个 name 兼三种语义只会让人误会。
 */

/** 支持对外提供服务的协议 */
export enum FileServerType {
    smb = "smb",
    webdav = "webdav",
    sftp = "sftp",
}

/**
 * SMB 共享：客户端访问 \\host\<share_name>。
 * 账号在服务级（SMB 认证发生在 session setup，早于 tree_connect）。
 */
export interface SmbShare {
    /** 共享名，不能包含路径分隔符 */
    share_name: string;
    /** 该共享对应的本机目录绝对路径 */
    path: string;
    /** 该共享是否只读，与服务级 readonly 取或 */
    readonly: boolean;
}

/**
 * WebDAV 共享：客户端访问 /<url_path>。
 * 账号在服务级，一个账号可访问全部共享。
 */
export interface WebdavShare {
    /** URL 路径段，如 docs 对应 /docs */
    url_path: string;
    /** 该共享对应的本机目录绝对路径 */
    path: string;
    /** 该路径是否只读，与服务级 readonly 取或 */
    readonly: boolean;
}

/**
 * SFTP 账号：登录后根目录即 path。
 * 每条共享自带账号密码，不同账号看不到彼此的目录。
 */
export interface SftpAccount {
    /** 登录用户名 */
    username: string;
    /** 登录密码 */
    password: string;
    /** 登录后的根目录绝对路径 */
    path: string;
    /** 该路径是否只读，与服务级 readonly 取或 */
    readonly: boolean;
}

/** SMB 服务的专属配置 */
export interface SmbConfig {
    /** 服务端主机名，Windows 网上邻居里显示的名字 */
    hostname: string;
    /** 服务级账号 */
    username: string;
    /** 服务级密码 */
    password: string;
    /** 共享列表 */
    shares: SmbShare[];
}

/** WebDAV 服务的专属配置 */
export interface WebdavConfig {
    /** 服务级账号 */
    username: string;
    /** 服务级密码 */
    password: string;
    /** 共享列表 */
    shares: WebdavShare[];
}

/** SFTP 服务的专属配置 */
export interface SftpConfig {
    /** 账号列表，每个账号就是一个共享 */
    shares: SftpAccount[];
}

/** 一条文件服务配置 */
export interface FileServerItem {
    /** 唯一 id */
    id: string;
    /** 协议类型，决定下面哪个配置字段有效 */
    type: FileServerType;
    /** 备注，便于在列表里辨认 */
    note: string;

    /** 是否启用；进程启动时按它决定是否拉起 */
    enabled: boolean;
    /** 监听端口（三种协议都必须独立端口） */
    port: number;
    /** 服务级只读：拒绝一切写操作，与每条共享的 readonly 取或 */
    readonly: boolean;

    // ---------- 协议专属配置，只有对应 type 的那个字段有值 ----------
    smb?: SmbConfig;
    webdav?: WebdavConfig;
    sftp?: SftpConfig;

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

/** 只读读取某协议的共享列表，用于统一做校验 */
export function get_all_shares(item: Partial<FileServerItem>): {name: string; path: string; password?: string; readonly: boolean}[] {
    if (item.type === FileServerType.smb) {
        return (item.smb?.shares ?? []).map(v => ({
            name: v.share_name, path: v.path, readonly: v.readonly,
        }));
    }
    if (item.type === FileServerType.webdav) {
        return (item.webdav?.shares ?? []).map(v => ({
            name: v.url_path, path: v.path, readonly: v.readonly,
        }));
    }
    if (item.type === FileServerType.sftp) {
        return (item.sftp?.shares ?? []).map(v => ({
            name: v.username, path: v.path, password: v.password, readonly: v.readonly,
        }));
    }
    return [];
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

    const shares = get_all_shares(item);
    if (shares.length === 0) {
        return "shares is required";
    }

    const names = new Set<string>();
    for (const share of shares) {
        if (!share.name) {
            return "share name is required";
        }
        if (!share.path) {
            return `share ${share.name}: path is required`;
        }
        if (names.has(share.name)) {
            return `duplicate share name: ${share.name}`;
        }
        names.add(share.name);

        // SMB 共享名与 WebDAV 路径段都是一个名字，不能含路径分隔符
        if (item.type !== FileServerType.sftp && /[\\/]/.test(share.name)) {
            return `share name must not contain path separator: ${share.name}`;
        }

        // SFTP 每个共享即一个账号，必须有密码
        if (item.type === FileServerType.sftp && !share.password) {
            return `share ${share.name}: password is required`;
        }
    }

    if (item.type === FileServerType.webdav) {
        if (!item.webdav?.username) {
            return "webdav username is required";
        }
        if (!item.webdav?.password) {
            return "webdav password is required";
        }
    }

    if (item.type === FileServerType.smb) {
        if (!item.smb?.username) {
            return "smb username is required";
        }
        if (!item.smb?.password) {
            return "smb password is required";
        }
    }

    return null;
}
