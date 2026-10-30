import {ShellProvider, ShellType} from "./shell_provider";

/**
 * PowerShell 的启动参数。
 * -NoProfile 跳过用户 profile，避免加载慢和干扰输出；
 * -NonInteractive 禁止任何交互式提问，否则命令会卡死等输入；
 * -Command 后面接要执行的脚本。
 */
export function build_powershell_args(cmd: string): string[] {
    return ["-NoProfile", "-NonInteractive", "-Command", cmd];
}

/**
 * 让 PowerShell 以 UTF-8 输出。
 *
 * Windows 上 PowerShell 默认按系统代码页（中文环境是 GBK）编码 stdout，
 * 直接按 UTF-8 解码会得到乱码。这里显式把输出编码改成 UTF-8。
 *
 * 两个设置都要设：
 *   - [Console]::OutputEncoding 管原生 exe 的输出
 *   - $OutputEncoding 管 cmdlet 自己输出的管道编码
 * 老版本 PowerShell 需要 .NET 的 UTF8Encoding（带 BOM 的那个会出问题，
 * 所以显式用 false 关闭 BOM）。
 */
const UTF8_PREAMBLE =
    "$_utf8 = New-Object System.Text.UTF8Encoding $false; " +
    "[Console]::OutputEncoding = $_utf8; " +
    "$OutputEncoding = $_utf8; ";

/**
 * powershell 的 shell provider。
 *
 * 在用户命令前面加 UTF-8 编码设置，后面追加退出码收尾脚本。
 *
 * 退出码为什么要绕这么一圈：
 *   PS 5.1 里，原生 exe 即使返回 0，只要它往 stderr 写过东西
 *   （例如 git push 输出到 stderr），$? 就会是 $false。
 *   只看 $? 会把成功的命令误判为失败。
 *   所以优先用 $LASTEXITCODE（只反映最后一次原生 exe 的退出码），
 *   它只在「整个会话没跑过原生 exe」时才是 $null，那时才回退到 $?。
 *
 * @param shellPath powershell 可执行文件路径
 * @param type pwsh（PowerShell 7+）还是 powershell（Windows PowerShell 5.1）
 */
export function create_powershell_provider(shellPath: string, type: ShellType): ShellProvider {
    return {
        type,
        shellPath,
        detached: false,
        // provider 已把 OutputEncoding 设成 UTF-8，所以输出就是 UTF-8
        outputEncoding: "utf8",

        buildExecCommand(command: string): string {
            return build_powershell_command(command);
        },

        getSpawnArgs(commandString: string): string[] {
            return build_powershell_args(commandString);
        },

        getEnvironmentOverrides(): Record<string, string> {
            return {};
        },
    };
}

/**
 * 组装 PowerShell 要执行的命令。
 *
 * 在用户命令后面追加收尾脚本：算退出码后退出。
 */
export function build_powershell_command(command: string): string {
    const trailer =
        `\n; $_ec = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }` +
        `\n; exit $_ec`;

    // 前面加 UTF-8 编码设置，否则 Windows 上中文输出会是 GBK 乱码
    return UTF8_PREAMBLE + command + trailer;
}
