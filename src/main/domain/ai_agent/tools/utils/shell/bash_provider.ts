import {ShellProvider} from "./shell_provider";

/**
 * bash 的 shell provider。
 */
export function create_bash_provider(shellPath: string): ShellProvider {
    return {
        type: "bash",
        shellPath,
        detached: true,
        // bash（含 Git Bash on Windows）输出就是 UTF-8
        outputEncoding: "utf8",

        buildExecCommand(command: string): string {
            return command;
        },

        getSpawnArgs(commandString: string): string[] {
            // -c 表示执行后面的字符串；-l 让 shell 作为登录 shell 加载 /etc/profile 等，
            // 这样用户 PATH 里的命令（nvm、pyenv 之类）才找得到
            return ["-c", "-l", commandString];
        },

        getEnvironmentOverrides(): Record<string, string> {
            return {};
        },
    };
}
