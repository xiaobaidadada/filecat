/**
 * shell provider 的接口定义。
 *
 * 一个 provider 负责回答三件事：
 *   1. 用什么可执行文件启动 shell
 *   2. 命令字符串怎么组装成最终要运行的命令行
 *   3. spawn 时需要哪些额外参数、哪些环境变量覆盖
 *
 * 这样 bash 和 powershell 的差异被完全收进各自的 provider，
 * 上层执行逻辑不需要关心当前是什么 shell。
 */

/**
 * 支持的 shell 种类。
 *
 * 注意这里区分 pwsh 和 Windows PowerShell 5.1：
 * 两者语法基本一致，但可执行文件和可用模块不同，
 * 让模型能明确指定要用哪个。
 */
export type ShellType = "bash" | "pwsh" | "powershell" | "cmd";

export interface ShellProvider {
    /** 该 provider 对应的 shell 类型，全局唯一 */
    readonly type: ShellType;

    /** shell 可执行文件的绝对路径 */
    readonly shellPath: string;

    /**
     * 是否以独立进程组启动（detached）。
     * bash 需要，这样 kill 时能连子孙进程一起处理。
     */
    readonly detached: boolean;

    /**
     * 该 shell 输出 stdout/stderr 时使用的编码。
     *
     * cmd.exe 在中文 Windows 上输出 GBK(936)，直接按 utf8 解码会把
     * 中文变成 U+FFFD 且原始字节丢失，所以必须按正确编码解。
     * bash 和 powershell（已强制设成 UTF-8 输出）都是 utf8。
     */
    readonly outputEncoding: string;

    /**
     * 把用户命令组装成最终要执行的命令行。
     *
     * 设计成同步：调用方（SystemUtil.command 等）需要在同步上下文里拿到
     * spawn 参数，异步会逼出第二套拼装逻辑，两边规则一旦分叉就会出诡异 bug。
     *
     * @param command 用户/AI 给出的原始命令
     * @returns 最终交给 shell 的字符串
     */
    buildExecCommand(command: string): string;

    /** 该 shell 启动时需要的命令行参数（含实际要执行的脚本） */
    getSpawnArgs(commandString: string): string[];

    /** 需要覆盖的环境变量 */
    getEnvironmentOverrides(): Record<string, string>;
}
