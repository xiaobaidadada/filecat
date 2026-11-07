import {createRequire} from "module";
import {FileUtil} from "./FileUtil";

const require_ = createRequire(__filename);

/**
 * 定位 ripgrep 可执行文件。
 *
 * 二进制由 @vscode/ripgrep 的各平台包提供，npm 安装时只装当前平台那一个，
 * 运行时直接解析路径，无需下载。
 * 该包的入口是 ESM，本项目编译到 CommonJS，不能直接 import，
 * 但它内部逻辑就是这一句 require.resolve，等价实现即可。
 *
 * 当前平台没有对应预编译包（或安装时该可选依赖失败）时返回 null，
 * 调用方需要自行降级。
 */
export function get_rg_path(): string | null {
    const arch = process.env.npm_config_arch || process.arch;
    const platform_pkg = `@vscode/ripgrep-${process.platform}-${arch}`;
    const binary_name = process.platform === "win32" ? "rg.exe" : "rg";
    try {
        return require_.resolve(`${platform_pkg}/bin/${binary_name}`);
    } catch {
        return null;
    }
}

/**
 * 取当前环境可用的 ripgrep 路径。
 * 没有预编译包或文件不可访问时返回 null，调用方据此降级到纯 JS 实现。
 */
export async function resolve_rg_path(): Promise<string | null> {
    const rg_path = get_rg_path();
    if (!rg_path) {
        return null;
    }
    if (!await FileUtil.access(rg_path)) {
        return null;
    }
    return rg_path;
}
