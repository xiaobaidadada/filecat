import {MountDriverType} from "./driver/file_driver";
import {CredentialType} from "../../../common/credential.pojo";

// 凭据类型与字段元信息是前后端共用的，定义在 src/common 下，这里转发一次
// 让后端原有 import 路径不用改
export * from "../../../common/credential.pojo";

/**
 * 驱动类型 → 需要的凭据类型。
 * 所有驱动都走凭据表：挂载只保存 credential_id。
 */
export const DRIVER_CREDENTIAL_TYPE: Record<string, CredentialType> = {
    [MountDriverType.webdav]: "webdav",
    [MountDriverType.sftp]: "ssh",
    [MountDriverType.smb]: "smb",
    [MountDriverType.s3]: "s3",
    [MountDriverType.baidu]: "baidu",
    [MountDriverType.local]: "local",
    [MountDriverType.tcp_proxy]: "tcp_proxy",
};
