import {FileDriver, MountDriverType} from "./file_driver";
import {FileMountItem} from "../mount.pojo";
import {CredentialItem} from "../credential.pojo";
import {WebdavDriver, WebdavConfig} from "./webdav_driver";
import {SftpDriver, SftpConfig} from "./sftp_driver";
import {SmbDriver, SmbConfig} from "./smb_driver";
import {S3Driver, S3Config} from "./s3_driver";
import {BaiduDriver, BaiduConfig} from "./baidu_driver";
import {LocalDriver, LocalDriverConfig} from "./local_driver";
import {TcpProxyDriver, TcpProxyDriverConfig} from "./tcp_proxy_driver";

/**
 * 驱动实例缓存。
 * 网络协议的客户端（SSH 连接、SMB 会话）建立成本高，
 * 用「挂载 id + 配置指纹」做键缓存，配置变更时自动失效。
 */
const driver_cache = new Map<string, {driver: FileDriver; fingerprint: string}>();

/** 简单稳定的字符串指纹，用于判断挂载或凭据是否变化 */
function fingerprint(item: FileMountItem, cred: CredentialItem): string {
    // account_id 也要参与指纹：只切换账号时驱动必须重建
    return `${item.driver}|${item.account_id ?? ""}|${item.root_dir ?? ""}|${JSON.stringify(cred)}`;
}

/**
 * 各驱动自己的配置类型。
 * 每个驱动的构造函数都要求它自己的那套字段，这里统一列出来做判别联合。
 */
export type DriverConfig =
    | {driver: MountDriverType.webdav; config: WebdavConfig}
    | {driver: MountDriverType.sftp; config: SftpConfig}
    | {driver: MountDriverType.smb; config: SmbConfig}
    | {driver: MountDriverType.s3; config: S3Config}
    | {driver: MountDriverType.baidu; config: BaiduConfig}
    | {driver: MountDriverType.local; config: LocalDriverConfig}
    | {driver: MountDriverType.tcp_proxy; config: TcpProxyDriverConfig};

/** 取挂载自己的位置信息（root_dir），按驱动类型去掉首尾斜杠的规则不同 */
function root_of(item: FileMountItem): string {
    const raw = String(item.root_dir ?? "").trim();
    // SMB 的共享名、S3 的桶名是路径段，不能带首尾斜杠；远端目录（sftp/webdav/baidu）是绝对路径，只去尾斜杠
    if (item.driver === MountDriverType.smb || item.driver === MountDriverType.s3) {
        return raw.replace(/^[/\\]+|[/\\]+$/g, "");
    }
    // 单独一个 / 表示服务器根，去掉尾斜杠会变空串，语义就丢了
    const trimmed = raw.replace(/\/+$/, "");
    return trimmed === "" && raw !== "" ? "/" : trimmed;
}

/** 取凭据下被选中的账号 */
function account_of(item: FileMountItem, cred: CredentialItem) {
    return (cred.accounts ?? []).find((v) => v.id === item.account_id);
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
function build_config(item: FileMountItem, cred: CredentialItem): DriverConfig {
    const root = root_of(item);
    const account = account_of(item, cred);

    switch (item.driver) {
        case MountDriverType.webdav:
            return {
                driver: item.driver,
                config: {
                    url: cred.webdav_url ?? "",
                    username: account?.account_name,
                    password: account?.password,
                    root,
                },
            };
        case MountDriverType.sftp:
            return {
                driver: item.driver,
                config: {
                    host: cred.ssh_host ?? "",
                    port: cred.ssh_port,
                    username: account?.account_name ?? "",
                    password: account?.password,
                    private_key: cred.ssh_private_key,
                    root,
                },
            };
        case MountDriverType.smb: {
            // 共享名是位置信息而不是认证信息，从 root_dir 的第一段取出
            const [share, ...rest] = root.split("/");
            return {
                driver: item.driver,
                config: {
                    server: cred.smb_server ?? "",
                    share: share ?? "",
                    username: account?.account_name,
                    password: account?.password,
                    root: rest.join("/"),
                },
            };
        }
        case MountDriverType.s3: {
            // 存储桶同理：第一段是桶，后面是 Key 前缀
            const [bucket, ...rest] = root.split("/");
            return {
                driver: item.driver,
                config: {
                    endpoint: cred.s3_endpoint ?? "",
                    bucket: bucket ?? "",
                    region: cred.s3_region,
                    access_key: account?.account_name ?? "",
                    secret_key: account?.secret_key ?? "",
                    root: rest.join("/"),
                    force_path_style: cred.s3_force_path_style ? "1" : "",
                },
            };
        }
        case MountDriverType.baidu:
            return {
                driver: item.driver,
                config: {
                    // 百度 token 按「应用凭据 + 账号」两段存
                    account_key: cred.id,
                    account_id: account?.id ?? "",
                    root,
                },
            };
        case MountDriverType.local:
            return {
                driver: item.driver,
                config: {
                    // 本地目录的 root_dir 是「映射名」，不是路径
                    sources: cred.local_sources ?? [],
                    root: String(item.root_dir ?? "").trim(),
                },
            };
        case MountDriverType.tcp_proxy:
            return {
                driver: item.driver,
                config: {
                    client_num_id: cred.tcp_client_num_id ?? "",
                    username: account?.account_name,
                    password: account?.password,
                    base_url: cred.tcp_base_url,
                    root,
                },
            };
        default:
            throw new Error(`不支持的挂载类型：${item.driver}`);
    }
}

/** 按挂载 + 凭据创建驱动实例 */
function create_driver(item: FileMountItem, cred: CredentialItem): FileDriver {
    const built = build_config(item, cred);
    switch (built.driver) {
        case MountDriverType.webdav:
            return new WebdavDriver(built.config);
        case MountDriverType.sftp:
            return new SftpDriver(built.config);
        case MountDriverType.smb:
            return new SmbDriver(built.config);
        case MountDriverType.s3:
            return new S3Driver(built.config);
        case MountDriverType.baidu:
            return new BaiduDriver(built.config);
        case MountDriverType.local:
            return new LocalDriver(built.config);
        case MountDriverType.tcp_proxy:
            return new TcpProxyDriver(built.config);
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
