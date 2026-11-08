import {FileDriver, MountDriverType} from "./file_driver";
import {FileMountItem} from "../mount.pojo";
import {CredentialItem} from "../credential.pojo";
import {WebdavDriver} from "./webdav_driver";
import {SftpDriver} from "./sftp_driver";
import {SmbDriver} from "./smb_driver";
import {S3Driver} from "./s3_driver";
import {BaiduDriver} from "./baidu_driver";
import {LocalDriver} from "./local_driver";
import {TcpProxyDriver} from "./tcp_proxy_driver";

/**
 * 驱动实例缓存。
 * 网络协议的客户端（SSH 连接、SMB 会话）建立成本高，
 * 用「挂载 id + 配置指纹」做键缓存，配置变更时自动失效。
 */
const driver_cache = new Map<string, {driver: FileDriver; fingerprint: string}>();

/** 简单稳定的字符串指纹，用于判断挂载或凭据是否变化 */
function fingerprint(item: FileMountItem, cred: CredentialItem): string {
    // account_id 也要参与指纹：只切换账号时驱动必须重建
    return `${item.driver}|${item.account_id ?? ""}|${item.root_dir ?? ""}|${JSON.stringify(cred.config ?? {})}`;
}

/**
 * 把一个「挂载 + 凭据」组装成驱动需要的配置。
 * 凭据提供连接信息，挂载提供它自己的「位置信息」。
 *
 * 位置信息在界面上是逐类型不同的控件，但都存在 root_dir 这一个字段里：
 *  · smb  —— 共享名，可选「共享名/子路径」
 *  · s3   —— 存储桶，可选「桶/前缀」
 *  · 其它 —— 远端起始目录
 */
function build_config(item: FileMountItem, cred: CredentialItem): any {
    const raw = String(item.root_dir ?? "").trim();
    // SMB 的共享名、S3 的桶名是路径段，不能带首尾斜杠；远端目录（sftp/webdav/baidu）是绝对路径，原样保留
    const segment_driver = item.driver === MountDriverType.smb || item.driver === MountDriverType.s3;
    const root = segment_driver ? raw.replace(/^[/\\]+|[/\\]+$/g, "") : raw.replace(/\/+$/, "");
    const config: Record<string, any> = {
        ...(cred.config ?? {}),
        root,
    };

    // 凭据下的账号（账号密码、百度授权等）要并进配置：
    // 一个凭据可存多个账号，挂载时用 account_id 选中其中一条。
    const account = (cred.accounts ?? []).find((v) => v.id === item.account_id);
    if (account) {
        config.username = account.account_name;
        config.password = account.password;
        // S3 的密钥对：access_key 存 account_name，secret_key 单独存
        if (account.secret_key) {
            config.access_key = account.account_name;
            config.secret_key = account.secret_key;
        }
        // 百度网盘按 uk 存 token，登录名不参与
        if (account.token) {
            config.account_id = account.id;
            config.token = account.token;
        }
    }

    // 百度应用凭据 id：token 按「应用凭据 + 账号」两段存，缺了取不到授权
    if (item.driver === MountDriverType.baidu) {
        config.account_key = cred.id;
    }

    if (item.driver === MountDriverType.smb) {
        // 共享名是位置信息而不是认证信息，从 root_dir 的第一段取出
        const [share, ...rest] = root.split("/");
        config.share = share ?? "";
        config.root = rest.join("/");
    }

    if (item.driver === MountDriverType.s3) {
        // 存储桶同理：第一段是桶，后面是 Key 前缀
        const [bucket, ...rest] = root.split("/");
        config.bucket = bucket ?? "";
        config.root = rest.join("/");
    }

    if (item.driver === MountDriverType.local) {
        // 本地目录的 root_dir 是「映射名」，不是路径
        config.root = String(item.root_dir ?? "").trim();
    }

    return config;
}

/** 按挂载 + 凭据创建驱动实例 */
function create_driver(item: FileMountItem, cred: CredentialItem): FileDriver {
    const config = build_config(item, cred);
    switch (item.driver) {
        case MountDriverType.webdav:
            return new WebdavDriver(config);
        case MountDriverType.sftp:
            return new SftpDriver(config);
        case MountDriverType.smb:
            return new SmbDriver(config);
        case MountDriverType.s3:
            return new S3Driver(config);
        case MountDriverType.baidu:
            return new BaiduDriver(config);
        case MountDriverType.local:
            return new LocalDriver(config);
        case MountDriverType.tcp_proxy:
            return new TcpProxyDriver(config);
        default:
            throw new Error(`不支持的挂载类型：${item.driver}`);
    }
}

/**
 * 取（或创建）某条挂载的驱动实例。
 * 配置变化时旧实例会被丢弃 —— 网络客户端需要重新建立连接才能生效。
 */
export function get_driver(item: FileMountItem, cred: CredentialItem): FileDriver {
    const fp = fingerprint(item, cred);
    const cached = driver_cache.get(item.id);
    if (cached && cached.fingerprint === fp) {
        return cached.driver;
    }
    // 配置变了：尝试释放旧驱动持有的连接
    if (cached) {
        dispose_driver(item.id);
    }
    const driver = create_driver(item, cred);
    driver_cache.set(item.id, {driver, fingerprint: fp});
    return driver;
}

/** 创建一个不走缓存的临时驱动实例，用于「测试连接」 */
export function create_test_driver(item: FileMountItem, cred: CredentialItem): FileDriver {
    return create_driver(item, cred);
}

/** 挂载被删除/停用时释放其驱动资源 */
export function dispose_driver(mount_id: string): void {
    const cached = driver_cache.get(mount_id);
    if (!cached) {
        return;
    }
    try {
        (cached.driver as any).dispose?.();
    } catch (e) {
        // ignore
    }
    driver_cache.delete(mount_id);
}

/** 清空所有驱动缓存（例如百度授权信息变化时） */
export function dispose_all_drivers(): void {
    for (const id of Array.from(driver_cache.keys())) {
        dispose_driver(id);
    }
}
