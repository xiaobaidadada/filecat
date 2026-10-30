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

/** 终止原因：没有终止 / 用户主动停 / 超时 */
type StopReason = null | "stop" | "timeout";

/**
 * 一条正在执行的 shell 命令。
 *
 * 状态流转：
 *   running ──超时/主动停止──> stopped
 *      │
 *      └──自然退出──> completed
 *
 * 关键点：stop()/超时发的是强制终止（kill -9 / taskkill /f），
 * 发出后立即结算，不再等进程退出事件。
 * 强杀命令不保证进程会立刻消失，为了等一个「不会更准确」的退出码而挂起
 * 调用方是没有意义的——被终止的结果只看 stopped/timed_out 就够了。
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

    private status_value: "running" | "completed" | "stopped" = "running";

    private readonly abort_signal: AbortSignal | null;
    private readonly timeout: number;

    private timeout_timer: NodeJS.Timeout | null = null;

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

    get status(): "running" | "completed" | "stopped" {
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
     * 用 close 结算：close 表示「进程已退出 且 stdio 已全部关闭并读完」，
     * 天然把管道排空这件事包含在内，不用人为猜一个等待时间。
     *
     * 同时监听 exit 作为兜底：如果命令留下了继承 fd 的孙进程，
     * close 可能迟迟不来，这时退一步用 exit 的结果结算。
     */
    private watch_exit(): void {
        let closed = false;

        this.child.once("close", (code, signal) => {
            closed = true;
            this.finish(code, signal);
        });

        this.child.once("exit", () => {
            // close 紧跟着就会来，正常情况下什么都不用做；
            // 若 close 迟迟不来（stdout 被孙进程占着），
            // 已经拿到的输出就是全部能拿到的，直接结算
            setImmediate(() => {
                if (closed || this.settled) return;
                this.finish(this.child.exitCode, this.child.signalCode);
            });
        });

        this.child.once("error", () => {
            this.finish(null, null);
        });
    }

    private arm_timeout(): void {
        if (!(this.timeout > 0)) return;
        this.timeout_timer = setTimeout(() => {
            this.timeout_timer = null;
            if (this.status_value !== "running") return;

            // 超时的语义就是终止，不会改成后台继续跑
            this.terminate("timeout");
        }, this.timeout);
    }

    private clear_timeout(): void {
        if (this.timeout_timer) {
            clearTimeout(this.timeout_timer);
            this.timeout_timer = null;
        }
    }

    /** 主动停止：强制终止并立即结算 */
    stop(): void {
        if (this.status_value !== "running") return;
        this.terminate("stop");
    }

    /**
     * 强制终止进程并结算。
     *
     * 用的都是强杀（kill -9 / taskkill /f），发出去之后进程和它的输出
     * 都不会再有意义，所以立即结算。
     * 若此时还有尚未消费的管道数据，close 也不会再影响结果——
     * 结果已经被定格，finish 的 settled 标志会拦住后续的重复结算。
     */
    /**
     * 强制终止进程树并结算。
     *
     * 用 SystemUtil.killProcess 杀整棵进程树——只杀 shell 进程不够，
     * 它派生的子进程会变成孤儿继续跑，还占着输出管道。
     *
     * 发出强杀后立即结算，不再等进程退出事件：
     * 强杀不保证进程立刻消失，为了等一个不会更准确的退出码把调用方挂起没有意义。
     */
    private terminate(reason: Exclude<StopReason, null>): void {
        this.stop_reason = reason;
        const pid = this.child.pid;
        if (pid) {
            SystemUtil.killProcess(pid);
        }
        this.finish(null, "SIGKILL");
    }

    /** 结算最终结果 */
    private finish(code: number | null, signal: string | null): void {
        if (this.settled) return;
        this.settled = true;
        this.clear_timeout();

        this.status_value = this.stop_reason !== null ? "stopped" : "completed";

        const result: ExecResult = {
            // 被信号终止时 exitCode 是 null，按惯例转成 137（128 + SIGKILL）
            code: code !== null ? code : (signal ? 137 : null),
            stdout: this.stdout_tail.result(),
            stderr: this.stderr_tail.result(),
            stopped: this.stop_reason !== null,
            timed_out: this.stop_reason === "timeout",
            truncated: this.stdout_tail.is_truncated() || this.stderr_tail.is_truncated(),
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

