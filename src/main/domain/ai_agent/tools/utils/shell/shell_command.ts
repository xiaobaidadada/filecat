import {ChildProcess, spawn} from "child_process";
import {OutputTail} from "./output_tail";
import {get_shell, get_shell_by_type, get_shells} from "./find_shell";
import {ShellProvider} from "./shell_provider";
import {SystemUtil} from "../../../../sys/sys.utl";

const iconv = require("iconv-lite");

/**
 * 命令执行结果。
 * 不论成功失败，最终都以这个结构返回，方便上层统一处理。
 */
export interface ExecResult {
    stdout: string;
    stderr: string;
    /** 进程退出码 */
    code: number | null;

    /** 是否被主动停止 */
    stopped: boolean;

    /** 是否因为超时被终止 */
    timed_out: boolean;

    /** 输出过大被截断过 */
    truncated: boolean;

    /**
     * 已发出终止请求，但进程在宽限期内没有退出。
     * 为 true 说明命令可能还在跑，结果只能当作尽力而为。
     */
    exit_pending?: boolean;
}

/** 启动命令的参数 */
export interface ShellCommandOptions {
    /** 要执行的命令：字符串交给 shell 解释，数组在 use_shell=false 时是 [可执行文件, ...参数] */
    cmd: string | string[];
    /** 工作目录 */
    cwd: string;
    /** 毫秒超时，超时即终止；0 或不传表示不超时 */
    timeout?: number;
    /** false 表示不经过 shell，直接启动可执行文件 */
    use_shell?: boolean;
    /** 指定用哪个 shell，必须是 get_shells() 里的 type */
    shell?: string;
    /** 子进程环境变量，不传则继承当前进程 */
    env?: NodeJS.ProcessEnv;
    /** 外部取消信号 */
    abort_signal?: AbortSignal;
    /**
     * 是否在内存里收集输出（默认 true）。
     * 后台进程把输出直接写文件，不需要留在内存里，置为 false 可省掉一堆字符串拼接。
     */
    collect_output?: boolean;
}

/** 发出终止请求后，等待进程真正退出的宽限期 */
const KILL_GRACE_MS = 2000;

/**
 * 进程退出后等待输出排空的宽限期。
 *
 * 进程退出时管道里可能还有没读到的数据（输出量大、或子进程比 shell 晚退出）。
 * 给一点时间读完，否则结果末尾会丢掉几行。
 */
const DRAIN_GRACE_MS = 250;

/** 终止原因：没有终止 / 用户主动停 / 超时 */
type StopReason = null | "stop" | "timeout";

/**
 * 一条正在执行的 shell 命令。
 *
 * 状态流转：
 *   running ──超时/主动停止──> stopping ──进程真正退出──> stopped
 *      │
 *      └──自然退出──> completed
 *
 * 关键点：stop()/超时只表达「已请求终止」，不在这里结算结果。
 * 只有进程真的退出了才算结束，否则会出现「报告已停止、进程却还在跑」的假象。
 *
 * 通过 ShellCommand.spawn() 创建，自己负责启动进程、收集输出、处理超时和退出。
 * 调用方拿到实例后只需监听 result 或调用 stop()。
 */
export class ShellCommand {
    /** 进程退出后 resolve，拿到完整结果 */
    readonly result: Promise<ExecResult>;

    /** 实际的子进程，进程还没 spawn 出来时为 undefined */
    readonly child: ChildProcess;

    /** 启动时就确定的输出编码，无需调用方再传一次 */
    readonly output_encoding: string;

    private status_value: "running" | "stopping" | "completed" | "stopped" = "running";

    private readonly abort_signal: AbortSignal | null;
    private readonly timeout: number;

    private timeout_timer: NodeJS.Timeout | null = null;
    private kill_grace_timer: NodeJS.Timeout | null = null;

    private readonly stdout_tail = new OutputTail();
    private readonly stderr_tail = new OutputTail();

    private resolve_result: ((r: ExecResult) => void) | null = null;
    private bound_abort_handler: (() => void) | null = null;

    /** 输出监听器保存引用，cleanup 时精确移除 */
    private readonly on_stdout = (d: Buffer) => this.stdout_tail.append(this.decode(d));
    private readonly on_stderr = (d: Buffer) => this.stderr_tail.append(this.decode(d));

    /** 已经结算过就不再重复 */
    private settled = false;

    /** 终止原因，用于区分「超时」和「用户主动停止」 */
    private stop_reason: StopReason = null;

    private constructor(child: ChildProcess, options: ShellCommandOptions, output_encoding: string) {
        this.child = child;
        this.abort_signal = options.abort_signal ?? null;
        this.timeout = options.timeout ?? 0;
        this.output_encoding = output_encoding;

        // 后台进程自己管输出文件，不需要这里再收集一份到内存
        if (options.collect_output !== false) {
            this.attach_output();
        }

        this.result = new Promise<ExecResult>((resolve) => {
            this.resolve_result = resolve;
        });

        this.watch_exit();
        this.arm_timeout();

        if (this.abort_signal) {
            this.bound_abort_handler = () => this.stop();
            this.abort_signal.addEventListener("abort", this.bound_abort_handler, {once: true});
        }
    }

    /**
     * 按 options 启动一个子进程并开始跟踪。
     *
     * shell 的选择、命令组装、环境变量和输出编码全部在这里一次算定，
     * 避免调用方再单独查一遍 provider 导致两边不一致。
     */
    static spawn(options: ShellCommandOptions): ShellCommand {
        const provider = resolve_provider(options);
        const output_encoding = options.use_shell === false ? "utf8" : (provider?.outputEncoding || "utf8");

        let child: ChildProcess;
        if (provider) {
            const command_string = provider.buildExecCommand(
                Array.isArray(options.cmd) ? options.cmd.join(" ") : options.cmd
            );
            child = spawn(provider.shellPath, provider.getSpawnArgs(command_string), {
                cwd: options.cwd,
                env: options.env ? {...options.env, ...provider.getEnvironmentOverrides()} : provider.getEnvironmentOverrides(),
                stdio: ["pipe", "pipe", "pipe"],
                detached: provider.detached,
                windowsHide: true,
            });
        } else {
            // use_shell=false：不经 shell，直接启动可执行文件
            const [file, ...args] = options.cmd as string[];
            child = spawn(file, args, {
                cwd: options.cwd,
                env: options.env,
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true,
            });
        }

        return new ShellCommand(child, options, output_encoding);
    }

    get status(): "running" | "stopping" | "completed" | "stopped" {
        return this.status_value;
    }

    private attach_output(): void {
        this.child.stdout?.on("data", this.on_stdout);
        this.child.stderr?.on("data", this.on_stderr);
    }

    /**
     * 把输出字节按 shell 的实际编码解成字符串。
     *
     * 必须用 Buffer 解码而不能直接 d.toString()：
     * cmd.exe 在中文 Windows 上输出 GBK，按 utf8 解会把中文变成
     * U+FFFD 替换字符，原始字节就此丢失，事后无法恢复。
     *
     * 注意 data 事件可能把一个多字节字符截断在块边界上，
     * 但 iconv-lite 的流式解码需要额外状态，这里用最简单的方式处理：
     * 单块内完整解码，跨块被截断的字符会退化成替换字符。
     * 对命令输出而言这种情况极少（中文 Windows 下命令输出通常不大），
     * 换取实现简单是划算的。
     */
    private decode(buf: Buffer): string {
        const enc = this.output_encoding;
        if (!enc || enc === "utf8" || enc === "utf-8") {
            return buf.toString("utf8");
        }
        try {
            return iconv.decode(buf, enc);
        } catch {
            // 编码名不被支持时退回 utf8，至少不抛错中断执行
            return buf.toString("utf8");
        }
    }

    /**
     * 监听进程退出。
     *
     * 用 exit 而不是 close：close 要等所有 stdio 关闭，
     * 如果命令留下了继承 fd 的孙进程，close 会一直不来，
     * 导致明明命令结束了却卡住。
     */
    private watch_exit(): void {
        const on_exit = () => {
            if (this.settled) return;
            this.clear_timeout();
            // 给管道一点时间把残留数据读完再结算
            setTimeout(() => this.finish(this.child.exitCode, this.child.signalCode, false), DRAIN_GRACE_MS);
        };

        this.child.once("exit", on_exit);
        this.child.once("error", on_exit);
    }

    private arm_timeout(): void {
        if (!(this.timeout > 0)) return;
        this.timeout_timer = setTimeout(() => {
            this.timeout_timer = null;
            if (this.status_value !== "running") return;

            // 超时的语义就是终止，不会改成后台继续跑
            this.request_stop("timeout");

            // 宽限期内不退出就放弃等待，标记 exit_pending 让上层知道进程可能还在
            this.kill_grace_timer = setTimeout(() => {
                this.finish(null, "SIGKILL", true);
            }, KILL_GRACE_MS);
        }, this.timeout);
    }

    private clear_timeout(): void {
        if (this.timeout_timer) {
            clearTimeout(this.timeout_timer);
            this.timeout_timer = null;
        }
        if (this.kill_grace_timer) {
            clearTimeout(this.kill_grace_timer);
            this.kill_grace_timer = null;
        }
    }

    /**
     * 主动停止。
     *
     * 只把状态置为 stopping 并发出终止请求，不在这里立刻结算结果。
     * 终态由进程退出事件决定；但如果进程在宽限期内不退出
     * （忽略了终止信号、卡在不可中断状态），也必须在宽限期后强制结算，
     * 否则调用方会永远等下去。
     */
    stop(): void {
        if (this.status_value !== "running") return;
        this.request_stop("stop");

        // 宽限兜底：进程不退出也要收尾
        if (!this.kill_grace_timer) {
            this.kill_grace_timer = setTimeout(() => {
                this.finish(null, "SIGKILL", true);
            }, KILL_GRACE_MS);
        }
    }

    /** 发出终止请求，把状态切到 stopping */
    private request_stop(reason: Exclude<StopReason, null>): void {
        this.status_value = "stopping";
        this.stop_reason = reason;
        const pid = this.child.pid;
        if (!pid) return;
        try {
            SystemUtil.killProcess(pid)
        } catch {
            // 进程可能已经自己退出了，忽略
        }
    }

    /** 结算最终结果 */
    private finish(code: number | null, signal: string | null, exit_pending: boolean): void {
        if (this.settled) return;
        this.settled = true;
        this.clear_timeout();

        if (this.status_value === "stopping") {
            this.status_value = "stopped";
        } else if (this.status_value === "running") {
            this.status_value = "completed";
        }

        const result: ExecResult = {
            // 被信号终止时 exitCode 是 null，按惯例转成 128+信号值
            code: code !== null ? code : (signal ? 137 : null),
            stdout: this.stdout_tail.result(),
            stderr: this.stderr_tail.result(),
            stopped: this.stop_reason !== null,
            timed_out: this.stop_reason === "timeout",
            truncated: this.stdout_tail.is_truncated() || this.stderr_tail.is_truncated(),
            exit_pending: exit_pending || undefined,
        };

        if (this.resolve_result) {
            const r = this.resolve_result;
            this.resolve_result = null;
            r(result);
        }
    }

    /**
     * 释放监听，避免内存泄漏。
     * 注意只摘掉自己挂的监听，不 removeAllListeners，
     * 否则会连带删掉调用方（如后台进程管理器）挂的 data 监听。
     */
    cleanup(): void {
        this.clear_timeout();
        if (this.bound_abort_handler && this.abort_signal) {
            this.abort_signal.removeEventListener("abort", this.bound_abort_handler);
            this.bound_abort_handler = null;
        }
        this.child.stdout?.removeListener("data", this.on_stdout);
        this.child.stderr?.removeListener("data", this.on_stderr);
    }
}

/**
 * 按 options 解析出该用的 provider。
 * use_shell=false 时返回 null，表示不走 shell。
 */
function resolve_provider(options: ShellCommandOptions): ShellProvider | null {
    if (options.use_shell === false) {
        if (!Array.isArray(options.cmd) || !options.cmd.length) {
            throw new Error("use_shell 为 false 时 cmd 必须是数组，形如 [可执行文件, 参数1, 参数2]");
        }
        return null;
    }
    const provider = options.shell ? get_shell_by_type(options.shell) : get_shell();
    if (!provider) {
        const available = get_shells().map((p) => p.type).join(", ");
        throw new Error(`没有名为 ${options.shell} 的 shell，可用的是：${available || "无"}`);
    }
    return provider;
}

