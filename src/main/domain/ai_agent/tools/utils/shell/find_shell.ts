import {accessSync, constants, existsSync} from "fs";
import {execFileSync} from "child_process";
import {ShellProvider} from "./shell_provider";
import {create_bash_provider} from "./bash_provider";
import {create_powershell_provider} from "./powershell_provider";
import {create_cmd_provider} from "./cmd_provider";

/**
 * 判断一个路径是否真的可执行。
 *
 * Unix 上查 X_OK 即可；但某些环境（Nix 等）权限位不标准，
 * 这时退一步尝试跑一下，能跑就算可用。
 * 用 execFileSync 而不是 exec，避免路径里的空格被 shell 解释。
 */
function is_executable(shellPath: string): boolean {
    try {
        accessSync(shellPath, constants.X_OK);
        return true;
    } catch {
        try {
            execFileSync(shellPath, ["--version"], {timeout: 1000, stdio: "ignore"});
            return true;
        } catch {
            return false;
        }
    }
}

/** 该路径存在且可执行 */
function usable(p: string): boolean {
    return existsSync(p) && is_executable(p);
}

/**
 * bash / sh 的候选位置，按优先级排列。
 *
 * 先看 Windows 上常见的 Git Bash 安装位置，再看 Unix 的标准位置。
 * 不区分平台地放在一起：即使 Windows 装了 Git Bash 也能命中，
 * 而 Unix 上那几个路径本来就不存在，多列几个没有额外代价。
 */
function bash_candidates(): string[] {
    const list: string[] = [];

    // Windows：Git for Windows 自带的 bash
    const program_files = process.env.ProgramFiles;
    const program_files_x86 = process.env["ProgramFiles(x86)"];
    const local_app_data = process.env.LOCALAPPDATA;
    for (const base of [program_files, program_files_x86]) {
        if (base) {
            list.push(`${base}\\Git\\bin\\bash.exe`);
            list.push(`${base}\\Git\\usr\\bin\\bash.exe`);
        }
    }
    if (local_app_data) {
        list.push(`${local_app_data}\\Programs\\Git\\bin\\bash.exe`);
    }

    // Unix：标准位置，sh 放最后作为最小可用集合的兜底
    list.push("/bin/bash");
    list.push("/usr/bin/bash");
    list.push("/usr/local/bin/bash");
    list.push("/opt/homebrew/bin/bash");
    list.push("/bin/sh");
    list.push("/usr/bin/sh");

    return list;
}

/** pwsh（PowerShell 7）的候选位置，优先于老的 Windows PowerShell 5.1 */
function pwsh_candidates(): string[] {
    const list: string[] = [];
    const program_files = process.env.ProgramFiles;
    if (program_files) {
        list.push(`${program_files}\\PowerShell\\7\\pwsh.exe`);
        list.push(`${program_files}\\PowerShell\\7-preview\\pwsh.exe`);
    }
    // Unix 上 pwsh 的常见安装位置
    list.push("/usr/bin/pwsh");
    list.push("/usr/local/bin/pwsh");
    list.push("/opt/microsoft/powershell/7/pwsh");
    return list;
}

/** 老的 Windows PowerShell 5.1，排在 pwsh 之后 */
function windows_powershell_candidates(): string[] {
    const sysroot = process.env.SystemRoot || "C:\\Windows";
    return [`${sysroot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`];
}

/** cmd.exe，Windows 上的最后兜底 */
function cmd_candidates(): string[] {
    const sysroot = process.env.SystemRoot || "C:\\Windows";
    return [`${sysroot}\\System32\\cmd.exe`];
}

/** 从候选列表里找第一个可用的路径 */
function first_usable(candidates: string[]): string | null {
    for (const p of candidates) {
        if (usable(p)) return p;
    }
    return null;
}

/** 从 PATH 里找可执行文件，找不到返回 null */
function find_on_path(name: string): string | null {
    try {
        // 用 shell 无关的方式：直接尝试执行，能跑就说明在 PATH 里
        execFileSync(name, ["--version"], {timeout: 1000, stdio: "ignore"});
        return name;
    } catch {
        return null;
    }
}

/**
 * 按优先级探测所有可用的 shell。
 *
 * 顺序：bash/sh → pwsh → Windows PowerShell → cmd
 *
 * 之所以 bash 优先：bash 的命令语法在 Unix 和 Windows（Git Bash）上一致，
 * 模型写出来的命令不用按平台切换风格，出错率最低。
 *
 * 返回的列表保留了优先级顺序，第一个就是默认 shell。
 * 同名 shell 只保留第一个命中的（比如同时装了 Git Bash 的两个路径）。
 */
function resolve_all_shells(): ShellProvider[] {
    const found: ShellProvider[] = [];

    /** 同一 type 只收一次，避免列表里出现两个 bash */
    const push = (p: ShellProvider | null) => {
        if (!p) return;
        if (found.some((x) => x.type === p.type)) return;
        found.push(p);
    };

    // 1. bash / sh
    const bash = first_usable(bash_candidates()) ?? find_on_path("bash");
    push(bash ? create_bash_provider(bash) : null);

    // 2. pwsh（PowerShell 7 及以上）
    const pwsh = first_usable(pwsh_candidates()) ?? find_on_path("pwsh");
    push(pwsh ? create_powershell_provider(pwsh, "pwsh") : null);

    // 3. Windows PowerShell 5.1
    const powershell = first_usable(windows_powershell_candidates());
    push(powershell ? create_powershell_provider(powershell, "powershell") : null);

    // 4. cmd.exe 兜底
    const cmd = first_usable(cmd_candidates());
    push(cmd ? create_cmd_provider(cmd) : null);

    return found;
}

/**
 * 缓存的探测结果。
 *
 * 探测要访问文件系统甚至试着执行程序，不该每次执行命令都跑一遍。
 * 而且必须缓存：如果每次返回不同的 shell，
 * 告诉模型的 shell 名字和实际执行器可能会不一致。
 */
let cached_shells: ShellProvider[] | null = null;

/** 所有可用的 shell，按优先级排列，第一个是默认 */
function get_all_shells(): ShellProvider[] {
    if (!cached_shells) {
        cached_shells = resolve_all_shells();
    }
    return cached_shells;
}

/** 获取默认的 shell provider（带缓存） */
export function get_shell(): ShellProvider {
    const all = get_all_shells();
    if (!all.length) {
        throw new Error("找不到任何可用的 shell（bash / sh / pwsh / powershell / cmd 均不可用）");
    }
    return all[0];
}

/**
 * 获取所有可用的 shell，按优先级排列，第一个是默认。
 *
 * 同名 shell 只有一项，type 可以在整个进程内唯一标识一个 provider。
 */
export function get_shells(): ShellProvider[] {
    return get_all_shells();
}

/**
 * 当前默认 shell 的名称，用于在工具描述里告诉模型该用什么语法。
 *
 * 取的是实际探测到的结果，而不是按 process.platform 硬猜：
 * Windows 上装了 Git Bash 就会是 bash，和实际执行的一致。
 */
export function get_shell_name(): string {
    try {
        return get_shell().type
    } catch {
        return "没有shell"
    }
}

/**
 * 按 type 取 provider。
 *
 * 传 null/undefined 时返回默认项；传了但不存在时返回 null，
 * 由调用方决定是报错还是回退到默认。
 */
export function get_shell_by_type(type?: string | null): ShellProvider | null {
    const all = get_all_shells();
    if (!type) {
        return all[0] ?? null;
    }
    return all.find((p) => p.type === type) ?? null;
}
