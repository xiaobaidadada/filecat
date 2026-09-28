import {FileDriver, MountDriverType} from "./file_driver";
import {FileMountItem} from "../mount.pojo";
import {CredentialItem} from "../credential.pojo";
import {WebdavDriver} from "./webdav_driver";
import {SftpDriver} from "./sftp_driver";
import {SmbDriver} from "./smb_driver";
import {S3Driver} from "./s3_driver";
import {BaiduDriver} from "./baidu_driver";

/**
 * 驱动实例缓存。
 * 网络协议的客户端（SSH 连接、SMB 会话）建立成本高，
 * 用「挂载 id + 配置指纹」做键缓存，配置变更时自动失效。
 */
const driver_cache = new Map<string, {driver: FileDriver; fingerprint: string}>();

/** 简单稳定的字符串指纹，用于判断挂载或凭据是否变化 */
function fingerprint(item: FileMountItem, cred: CredentialItem): string {
    return `${item.driver}|${item.root_dir ?? ""}|${JSON.stringify(cred.config ?? {})}`;
}

/**
 * 把一个「挂载 + 凭据」组装成驱动需要的配置。
 * 凭据提供连接信息，挂载提供它自己的「起始目录」。
 */
function build_config(item: FileMountItem, cred: CredentialItem): any {
    return {
        ...(cred.config ?? {}),
        // 挂载自己的起始目录覆盖凭据里的（凭据里定位到根，挂载决定从哪开始）
        root: item.root_dir ?? "",
    };
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
