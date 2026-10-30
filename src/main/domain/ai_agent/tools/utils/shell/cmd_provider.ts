import {execFileSync} from "child_process";
import {ShellProvider} from "./shell_provider";

/**
 * 探测 Windows 当前控制台的输出代码页（OEM code page）。
 *
 * 中文 Windows 通常是 936(GBK)，日文是 932(Shift-JIS)，
 * 英文/西欧是 437 或 850。cmd 的 stdout 就按这个代码页编码。
 *
 * chcp 输出的那行提示文字本身也是 OEM 编码的（会显示成乱码），
 * 但里面的数字是纯 ASCII，用 latin1 读出来照样能正则匹配。
 */
function detect_oem_codepage(): string {
    try {
        const out = execFileSync("chcp", {
            shell: "cmd.exe",
            encoding: "latin1",
            windowsHide: true,
            timeout: 5000,
        });
        const m = out.match(/(\d{3,5})/);
        if (m) {
            return "cp" + m[1];
        }
    } catch {
        // 探测失败就用最保守的中文代码页，中文环境最常见
    }
    return "cp936";
}

/** cmd 的输出代码页，进程内只探测一次 */
let cached_codepage: string | null = null;

function get_oem_codepage(): string {
    if (!cached_codepage) {
        cached_codepage = process.platform === "win32" ? detect_oem_codepage() : "utf8";
    }
    return cached_codepage;
}

/**
 * cmd.exe 的 shell provider。
 *
 * 既没有 bash/sh、也没有 pwsh 的 Windows 环境上兜底使用。
 * cmd 的语法和 POSIX / PowerShell 差别都很大：
 *   - 没有 ; 作为命令分隔，多个命令用 &
 *   - 环境变量用 %VAR% 而不是 $VAR
 *   - 输出编码是系统 OEM 代码页，不是 UTF-8
 * 所以工具描述里必须把 shell 名字如实告诉模型，不能含糊。
 */
export function create_cmd_provider(shellPath: string): ShellProvider {
    return {
        type: "cmd",
        shellPath,
        detached: false,

        // cmd 的输出跟随控制台代码页，中文 Windows 下是 GBK
        get outputEncoding(): string {
            return get_oem_codepage();
        },

        buildExecCommand(command: string): string {
            return command;
        },

        getSpawnArgs(commandString: string): string[] {
            // /d 跳过 AutoRun 注册表项，避免用户的 autorun 脚本干扰输出
            // /s 让引号处理更符合直觉（保留最外层引号原文）
            // /c 执行后面这条命令后退出
            return ["/d", "/s", "/c", commandString];
        },

        getEnvironmentOverrides(): Record<string, string> {
            return {};
        },
    };
}
