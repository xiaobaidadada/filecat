import {execSync} from "child_process";
import {sysType} from "../shell/shell.service";
import {getProcessAddon} from "../bin/bin";
import {settingService} from "../setting/setting.service";
import {SysEnum} from "../../../common/req/user.req";
import {ShellCommand} from "../ai_agent/tools/utils/shell/shell_command";

const {exec} = require('child_process');
const util = require('util');
const exec_async = util.promisify(exec);

/** 每个 command_id 下正在执行的命令 */
const command_map: { [key: string]: Set<ShellCommand> } = {};

export class SystemUtil {


    /**
     * 执行命令
     *
     * 一个 command_id 可以对应多条 ShellCommand
     *
     * 使用系统上真实的 shell（类 Unix 用 bash，Windows 用 powershell）执行，
     * 由 common/shell 下的一套 provider 负责适配差异。
     *
     * options.timeout 毫秒超时。超时的语义是终止命令，不会转成后台继续跑；
     * 需要后台执行请用 exec_cmd_background 工具。
     * 输出只保留末尾一部分（见 OutputTail），防止大输出把内存吃光。
     */
    public static command(
        command_id: string,
        {cmd, cwd}: { cmd: string | string[], cwd: string },
        options?: {
            timeout?: number;
            /** false 表示不经过 shell，直接启动可执行文件 */
            use_shell?: boolean;
            /** 指定用哪个 shell */
            shell?: string;
            /** 追加/覆盖到子进程的环境变量（AI 的 command_env） */
            extra_env?: Record<string, string>;
        }
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            let shell_command: ShellCommand;
            try {
                shell_command = ShellCommand.spawn({
                    cmd,
                    cwd,
                    timeout: options?.timeout ?? 0,
                    use_shell: options?.use_shell,
                    shell: options?.shell,
                    env: {
                        ...process.env,
                        PATH: settingService.get_env_path(),
                        ...(options?.extra_env ?? {}),
                    },
                });
            } catch (e) {
                // 参数错误（比如 shell 名不存在）在 spawn 之外抛出，直接反馈给调用方
                reject(e);
                return;
            }

            // 登记到 command_id 下，供 kill_command 统一终止
            let commands = command_map[command_id];
            if (!commands) {
                commands = new Set<ShellCommand>();
                command_map[command_id] = commands;
            }
            commands.add(shell_command);

            /** 结果结算后清理登记，避免泄漏 */
            const cleanup = () => {
                commands.delete(shell_command);
                if (commands.size === 0) {
                    delete command_map[command_id];
                }
                shell_command.cleanup();
            };

            shell_command.result.then((result) => {
                cleanup();

                const output = result.stdout || result.stderr;

                if (result.timed_out) {
                    const partial = (result.stdout + result.stderr).trim();
                    reject(new Error(
                        `命令执行超过 ${options.timeout}ms 已终止` +
                        (result.truncated ? "(输出已截断)" : "") +
                        (partial ? `：\n${partial}` : "")
                    ));
                    return;
                }

                if (result.stopped) {
                    reject(new Error("命令已被终止"));
                    return;
                }

                if (result.code === 0) {
                    resolve(result.stdout);
                } else {
                    reject(new Error(`Command failed with code ${result.code}: ${output}`));
                }
            }).catch((e) => {
                cleanup();
                reject(e);
            });
        });
    }

    /**
     * 杀掉 command_id 对应的所有进程
     */
    public static kill_command(command_id: string): boolean {
        const commands = command_map[command_id];

        if (!commands || commands.size === 0) {
            return false;
        }

        // 先从 map 移除
        delete command_map[command_id];

        // 对每个命令走 stop 流程：它会发出终止请求，
        // 并在宽限期内没退出时强制结算，避免 Promise 永远挂住
        for (const shell_command of commands) {
            shell_command.stop();
        }

        commands.clear();

        return true;
    }


    // 执行某个命令 并返回 是否执行成功结果
    public static commandIsExist(cmd: string): boolean {
        try {
            // 异步的方式暂时没有跨平台的方式判断 exec会堵塞 bash等命令
            execSync(cmd, {stdio: 'pipe'});
            return true;
        } catch (e) {
            return false;
        }
    }

    public static killProcess(pid): void {
        if (!pid) return;
        const addon = getProcessAddon()
        if (addon) {
            addon.kill_process(pid, true);
            return;
        }
        if (sysType === SysEnum.win) {
            SystemUtil.commandIsExist(`taskkill /pid ${pid} /f /t`)
        } else {
            SystemUtil.commandIsExist(`kill -9 ${pid} `)
        }
    }

    public static async execAsync(cmd: string, cwd?: string): Promise<any> {
        const {stdout} = await exec_async(
            cmd,
            {
                encoding: "utf8",
                env: {
                    ...process.env,
                    PATH: settingService.get_env_path()
                },
                cwd
            }
        );
        return stdout;
    }

    public static is_arm() {
        return process.arch === "arm64"
    }

    public static is_x86() {
        return process.arch === "x64"
    }
}
