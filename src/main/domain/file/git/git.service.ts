import {exec} from "child_process";
import {Result, Sucess, Fail} from "../../../other/Result";
import {settingService} from "../../setting/setting.service";
import path from "path";

export interface GitStatusFile {
    path: string;
    status: string; // 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
    oldPath?: string;
}

export interface GitLogEntry {
    hash: string;
    message: string;
    author: string;
    date: string;
}

export interface GitBranchInfo {
    current: string;
    branches: string[];
}

export class GitServiceImpl {

    /**
     * 根据token和相对路径解析为系统绝对路径
     */
    private resolvePath(token: string, relativePath: string): string {
        const root = settingService.getFileRootPath(token);
        return path.join(root, relativePath ? decodeURIComponent(relativePath) : "");
    }

    private execGit(cwd: string, args: string, timeout = 30000): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(`git ${args}`, {cwd, timeout, maxBuffer: 10 * 1024 * 1024}, (err, stdout, stderr) => {
                if (err) {
                    // Git 经常将正常信息输出到 stderr，所以合并两者提供完整上下文
                    const errorMsg = [stderr, stdout, err.message]
                        .filter(Boolean)
                        .map(s => s!.trim())
                        .join('\n');
                    reject(new Error(errorMsg));
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    async gitStatus(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const output = await this.execGit(cwd, "status --porcelain -u");
            const files: GitStatusFile[] = [];
            if (output) {
                for (const line of output.split("\n")) {
                    if (!line) continue;
                    const statusCode = line.substring(0, 2).trim();
                    let filePath = line.substring(3);
                    let status = "untracked";
                    let oldPath: string | undefined;

                    if (statusCode.startsWith("M")) status = "modified";
                    else if (statusCode.startsWith("A")) status = "added";
                    else if (statusCode.startsWith("D")) status = "deleted";
                    else if (statusCode.startsWith("R")) {
                        status = "renamed";
                        const parts = filePath.split(" -> ");
                        if (parts.length === 2) {
                            oldPath = parts[0];
                            filePath = parts[1];
                        }
                    } else if (statusCode.startsWith("?")) status = "untracked";
                    else if (statusCode.startsWith("U")) status = "conflict";

                    // 双字符状态
                    if (statusCode.length === 2) {
                        const x = statusCode[0];
                        const y = statusCode[1];
                        if (x === "?" && y === "?") status = "untracked";
                        else if (x === "!" && y === "!") status = "ignored";
                        else if (x !== " " && x !== "?") status = "modified";
                    }

                    files.push({path: filePath, status, oldPath});
                }
            }
            return Sucess(files);
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitLog(token: string, relativePath: string, maxCount = 50): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const output = await this.execGit(cwd, `log --oneline --max-count=${maxCount} --format="%h|%s|%an|%ad" --date=format:"%Y-%m-%d %H:%M"`);
            const entries: GitLogEntry[] = [];
            if (output) {
                for (const line of output.split("\n")) {
                    const parts = line.split("|");
                    if (parts.length >= 4) {
                        entries.push({
                            hash: parts[0],
                            message: parts[1],
                            author: parts[2],
                            date: parts.slice(3).join("|"),
                        });
                    }
                }
            }
            return Sucess(entries);
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitBranches(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const output = await this.execGit(cwd, "branch -a");
            const branches: string[] = [];
            let current = "";
            if (output) {
                for (const line of output.split("\n")) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith("*")) {
                        current = trimmed.substring(1).trim();
                        branches.push(current);
                    } else {
                        branches.push(trimmed);
                    }
                }
            }
            return Sucess({current, branches});
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitAdd(token: string, relativePath: string, files: string[]): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const fileArgs = files.map(f => `"${f}"`).join(" ");
            const output = await this.execGit(cwd, `add ${fileArgs}`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitAddAll(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const output = await this.execGit(cwd, "add -A");
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitReset(token: string, relativePath: string, files: string[]): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const fileArgs = files.map(f => `"${f}"`).join(" ");
            const output = await this.execGit(cwd, `reset HEAD ${fileArgs}`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitCommit(token: string, relativePath: string, message: string, allChanged = false): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);

            if (allChanged) {
                // -a 模式：自动暂存所有已跟踪文件的修改并提交，无需事先 git add
                const output = await this.execGit(cwd, `commit -am "${message.replace(/"/g, '\\"')}"`);
                return Sucess(output || "ok");
            }

            // 普通模式：先检查是否有暂存内容，避免提交空内容时报错信息不友好
            const staged = await this.execGit(cwd, "diff --cached --name-only");
            if (!staged) {
                return Fail("没有暂存的更改可以提交（nothing to commit）。请先使用 git add 添加文件，或使用 allChanged=true 提交所有已跟踪文件的修改。");
            }
            const output = await this.execGit(cwd, `commit -m "${message.replace(/"/g, '\\"')}"`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitPush(token: string, relativePath: string, force = false): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const args = force ? "push --force" : "push";
            const output = await this.execGit(cwd, args, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitPull(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const output = await this.execGit(cwd, "pull", 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitCheckout(token: string, relativePath: string, branch: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const output = await this.execGit(cwd, `checkout "${branch}"`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitDiff(token: string, relativePath: string, file?: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const fileArg = file ? ` -- "${file}"` : "";
            const output = await this.execGit(cwd, `diff${fileArg}`);
            return Sucess(output || "");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitDiffStaged(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const output = await this.execGit(cwd, "diff --cached");
            return Sucess(output || "");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitCheckIgnore(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            // 检查是否存在 .git 目录
            const fs = await import("fs");
            const gitDir = path.join(cwd, ".git");
            const exists = fs.existsSync(gitDir);
            return Sucess({hasGit: exists});
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitStash(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const output = await this.execGit(cwd, "stash");
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(e.message);
        }
    }

    async gitStashPop(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const output = await this.execGit(cwd, "stash pop");
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(e.message);
        }
    }
}

export const gitService = new GitServiceImpl();
