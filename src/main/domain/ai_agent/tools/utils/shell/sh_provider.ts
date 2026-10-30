import {ShellProvider} from "./shell_provider";

/**
 * POSIX sh 的 shell provider。
 *
 * 用于没有 bash 的最小化环境（Alpine、BusyBox、debian:slim 等），
 * 这类系统里 /bin/sh 一定存在，是 POSIX 标准保证的最小可用集合。
 *
 * 和 bash 的区别只有一处：不传 -l。
 * -l 是 bash/zsh 的登录 shell 扩展，POSIX 不保证支持，
 * BusyBox 的 sh 传 -l 会直接报错，所以这里只用 -c。
 */
export function create_sh_provider(shellPath: string): ShellProvider {
    return {
        type: "sh",
        shellPath,
        detached: true,
        outputEncoding: "utf8",

        buildExecCommand(command: string): string {
            return command;
        },

        getSpawnArgs(commandString: string): string[] {
            return ["-c", commandString];
        },

        getEnvironmentOverrides(): Record<string, string> {
            return {};
        },
    };
}
