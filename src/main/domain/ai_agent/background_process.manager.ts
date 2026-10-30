/**
 * BackgroundProcessManager — 后台进程管理器
 *
 * 负责：
 * 1. 创建后台子进程执行命令
 * 2. 重定向 stdout/stderr 到日志文件
 * 3. 跟踪所有后台进程（进程列表、所属会话、输出文件路径）
 * 4. 系统启动时清空旧的输出目录
 * 5. 进程关闭后自动删除输出文件
 */
import { ChildProcess, spawn } from "child_process";
import path from "path";
import fs from "fs";
import { DataUtil } from "../data/DataUtil";
import { data_dir_tem_name } from "../data/data_type";
import { settingService } from "../setting/setting.service";
import { FileUtil } from "../file/FileUtil";
import {SystemUtil} from "../sys/sys.utl";
import { ShellCommand } from "./tools/utils/shell/shell_command";

// ==================== 类型定义 ====================

/** 后台进程记录 */
export interface BackgroundProcessRecord {
    /** 子进程 ID */
    pid: number;
    /** 所属会话 ID */
    session_id: string;
    /** 执行的命令 */
    cmd: string;
    /** 工作目录 */
    cwd: string;
    /** 启动时间 */
    start_time: number;
    /** 输出日志文件路径 */
    output_file: string;
    /** 输出文件里内容的编码，读取时按它解码，否则中文会乱码 */
    output_encoding: string;
    /** 进程是否还在运行 */
    running: boolean;
    /** 退出码（null 表示还在运行） */
    exit_code: number | null;
}

/** 后台进程列表项（返回给 tool/frontend） */
export interface BackgroundProcessInfo {
    pid: number;
    session_id: string;
    cmd: string;
    cwd: string;
    start_time: number;
    output_file: string;
    output_encoding: string;
    running: boolean;
    exit_code: number | null;
}

// ==================== 管理器 ====================

export class BackgroundProcessManager {
    /** 当前所有后台进程记录，key 为 pid */
    private processes: Map<number, BackgroundProcessRecord> = new Map();

    /** 输出目录路径 */
    private outputDir: string;

    /** 进程数量变化时的回调（由 controller 层注入，用于 WS 推送通知） */
    public onCountChange?: (count: number) => void;

    constructor() {
        this.outputDir = DataUtil.get_tem_path(data_dir_tem_name.sys_file_dir);
        const bgDir = path.join(this.outputDir, "background_cmd_output");
        this.outputDir = bgDir;
        // 异步初始化目录和清理
        this.initDir(bgDir);
    }

    /** 异步初始化输出目录 */
    private async initDir(dir: string) {
        await FileUtil.ensure_dir(dir);
        await this.cleanupOldOutputs(dir);
    }

    /**
     * 清空旧的输出文件（系统启动时调用）
     */
    private async cleanupOldOutputs(dir: string) {
        try {
            const files = await FileUtil.readdirSync(dir);
            for (const file of files) {
                await FileUtil.remove(path.join(dir, file));
            }
        } catch {
            // 目录可能不存在，忽略
        }
    }

    /**
     * 后台执行命令
     * @param cmd 要执行的命令
     * @param cwd 工作目录
     * @param session_id 所属会话 ID
     * @param options
     * @returns 进程信息
     */
    public execBackground(
        cmd: string | string[],
        cwd: string = process.cwd(),
        session_id: string = "unknown",
        options?: { shell?: string; use_shell?: boolean; extra_env?: Record<string, string> }
    ): BackgroundProcessInfo {
        // 和前台命令共用同一个 ShellCommand，shell 选择、命令组装、编码判定完全一致，
        // 避免同一个命令在前台和后台被不同 shell 解释出不同语义
        const shell_command = ShellCommand.spawn({
            cmd,
            cwd,
            use_shell: options?.use_shell,
            shell: options?.shell,
            env: {
                ...process.env,
                PATH: settingService.get_env_path(),
                ...(options?.extra_env ?? {}),
            },
            // 输出直接写文件，不在内存里再攒一份
            collect_output: false,
        });

        const child = shell_command.child;
        const outputFileName = `${child.pid}_${Date.now()}.log`;
        const outputFile = path.join(this.outputDir, outputFileName);

        // 记录和展示统一用字符串，数组形式按空格拼回去
        const cmd_text = Array.isArray(cmd) ? cmd.join(" ") : cmd;

        // 创建输出文件写入流
        const writeStream = fs.createWriteStream(outputFile, { flags: "a" });

        // 记录
        const record: BackgroundProcessRecord = {
            pid: child.pid!,
            session_id,
            cmd: cmd_text,
            cwd,
            start_time: Date.now(),
            output_file: outputFile,
            output_encoding: shell_command.output_encoding,
            running: true,
            exit_code: null,
        };

        // 输出按字节原样写文件，编码只在后面读取时用
        child.stdout?.on("data", (chunk: Buffer) => {
            writeStream.write(chunk);
        });

        child.stderr?.on("data", (chunk: Buffer) => {
            writeStream.write(chunk);
        });

        // 进程退出或出错，最终都会走到 ShellCommand 的 result
        shell_command.result.then((result) => {
            record.running = false;
            record.exit_code = result.code;
            writeStream.end();
            this.processes.delete(record.pid);
            FileUtil.remove(outputFile);
            this.onCountChange?.(this.processes.size);
        });

        this.processes.set(record.pid, record);
        this.onCountChange?.(this.processes.size);

        return this.toInfo(record);
    }

    /**
     * 获取所有后台进程列表
     * @param session_id 可选，按会话过滤
     */
    public listProcesses(session_id?: string): BackgroundProcessInfo[] {
        const result: BackgroundProcessInfo[] = [];
        for (const [, record] of this.processes) {
            if (session_id && record.session_id !== session_id) continue;
            result.push(this.toInfo(record));
        }
        return result;
    }

    /**
     * 获取某个进程的输出内容
     * @param pid 进程 ID
     * @returns 输出文件路径与所属会话，如果进程不存在则返回 null
     */
    public getProcessOutput(pid: number): { output_file: string; output_encoding: string; running: boolean; session_id: string } | null {
        const record = this.processes.get(pid);
        if (!record) return null;
        return {
            output_file: record.output_file,
            output_encoding: record.output_encoding,
            running: record.running,
            session_id: record.session_id,
        };
    }

    /**
     * 终止某个后台进程
     * @param pid 进程 ID
     */
    public killProcess(pid: number): boolean {
        const record = this.processes.get(pid);
        if (!record || !record.running) return false;

        try {
            // 使用 SystemUtil.killProcess（跨平台）
            SystemUtil.killProcess(pid);
            return true;
        } catch (e) {
            // 如果 killProcess 失败，尝试直接 kill
            try {
                process.kill(pid, "SIGKILL");
                return true;
            } catch {
                return false;
            }
        }
    }

    /**
     * 转换内部记录为对外信息
     */
    private toInfo(record: BackgroundProcessRecord): BackgroundProcessInfo {
        return {
            pid: record.pid,
            session_id: record.session_id,
            cmd: record.cmd,
            cwd: record.cwd,
            start_time: record.start_time,
            output_file: record.output_file,
            output_encoding: record.output_encoding,
            running: record.running,
            exit_code: record.exit_code,
        };
    }
}

/** 全局单例 */
export const backgroundProcessManager = new BackgroundProcessManager();

/**
 * 按指定编码把输出字节解成字符串。
 *
 * 后台进程的输出是原样按字节写入文件的，所以读到的是准确的原始字节，
 * 只要按正确的编码解码就不会乱码。cmd 在中文 Windows 上是 GBK。
 */
export function decode_output(buf: Buffer, encoding?: string): string {
    const enc = encoding || "utf8";
    if (enc === "utf8" || enc === "utf-8") {
        return buf.toString("utf8");
    }
    try {
        const iconv = require("iconv-lite");
        return iconv.decode(buf, enc);
    } catch {
        return buf.toString("utf8");
    }
}
