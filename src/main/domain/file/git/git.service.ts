import {exec} from "child_process";
import {Result, Sucess, Fail} from "../../../other/Result";
import {settingService} from "../../setting/setting.service";
import {userService} from "../../user/user.service";
import {FileUtil} from "../FileUtil";
import path from "path";

export interface GitStatusFile {
    path: string;
    // 暂存区状态 X，取值：M(修改) A(新增) D(删除) R(重命名) C(复制) ?(未跟踪) U(冲突) 空格(无)
    index: string;
    // 工作区状态 Y，取值同上
    worktree: string;
    // 是否有已暂存的改动（index 非空格且非 ?）
    staged: boolean;
    untracked: boolean;
    conflicted: boolean;
    oldPath?: string;
}

export interface GitLogEntry {
    hash: string;
    message: string;
    author: string;
    date: string;
    /** 提交所指向的引用名（分支、tag、HEAD 等），来自 %D */
    refs?: string[];
    /** 父提交短 hash，用于绘制树形血缘 */
    parents?: string[];
    /** 是否尚未推送到上游分支 */
    unpushed?: boolean;
}

export interface GitBranchInfo {
    current: string;
    branches: string[];
}

export class GitServiceImpl {

    /**
     * 统一提取错误描述。
     * resolvePath 等方法抛的是字符串而非 Error，直接取 e.message 会得到 undefined，
     * 导致前端只能看到空错误信息。
     */
    private err_msg(e: any): string {
        if (typeof e === "string") return e;
        return e?.message || String(e);
    }

    /**
     * 解析为用户可操作的绝对路径（读操作）。
     * 1. 拼接用户根目录，防路径穿越
     * 2. 校验路径是否属于用户可访问范围
     */
    private resolvePath(token: string, relativePath: string): string {
        const root = settingService.getFileRootPath(token);
        // 用 resolve 而非 join：能正确处理 .. 和绝对路径，并得到规范化结果
        const target = path.resolve(root, relativePath ? decodeURIComponent(relativePath) : ".");
        // 路径穿越防护：必须落在用户根目录内
        if (!userService.isSubPath(root, target)) throw "path is invalid";
        // 用户访问权限校验（access_dirs / not_access_dirs）
        userService.check_user_path(token, target);
        return target;
    }

    /**
     * 解析为可写路径（写操作），在 resolvePath 基础上追加只读目录校验
     */
    private resolveWritePath(token: string, relativePath: string): string {
        const target = this.resolvePath(token, relativePath);
        // 只读目录禁止任何写操作
        userService.check_user_only_path(token, target);
        return target;
    }

    /**
     * 校验 git 仓库目录，避免对非仓库目录执行命令
     */
    private async ensureGitRepo(cwd: string): Promise<void> {
        const git_dir = path.join(cwd, ".git");
        const exists = await FileUtil.access(git_dir).then(() => true).catch(() => false);
        if (!exists) throw "not a git repository";
    }

    /**
     * 清洗 git ref（分支名 / commit hash / HEAD~n 等），只允许安全字符，防命令注入。
     */
    private clean_ref(ref: string): string {
        return ref.replace(/[^0-9a-zA-Z_.\-/~^:@{}]/g, "");
    }

    /**
     * 执行 git 命令并返回原始 Buffer（用于读取文件内容，避免 shell 编码转换破坏字节）。
     */
    private execGitBuffer(cwd: string, args: string, timeout = 30000): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            exec(`git ${args}`, {cwd, timeout, maxBuffer: 20 * 1024 * 1024, encoding: "buffer"}, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout as unknown as Buffer);
            });
        });
    }

    /**
     * 取文件在指定版本的内容，供前端 Ace diff 视图做左右两版对比。
     * ref 取值：worktree(工作区文件) / staged(暂存区) / HEAD / <commit hash> / <分支名> 等任意 git revision。
     * 二进制文件与超大文件一律返回 binary=true、text=null，由前端提示无法比较（与 JetBrains 行为一致）。
     */
    async gitFileContent(token: string, relativePath: string, file: string, ref: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            // file 是仓库内相对路径，规范化后禁止越出仓库
            const rel_file = path.normalize(file).replace(/^(\.\.[\/\\])+/, "").replace(/\\/g, "/");
            if (!rel_file || rel_file.startsWith("..")) return Fail("file is invalid");

            let buf: Buffer | null = null;
            if (ref === "worktree") {
                const abs = path.join(cwd, rel_file);
                // 文件可能已被删除，视为空内容（旧版本有内容时表现为整篇删除）
                if (await FileUtil.access(abs)) buf = await FileUtil.readFileSync(abs);
            } else {
                const args = ref === "staged" ? `show :"${rel_file}"` : `show ${this.clean_ref(ref)}:"${rel_file}"`;
                try {
                    buf = await this.execGitBuffer(cwd, args);
                } catch (e) {
                    // 该版本下文件不存在（新增文件查历史、删除文件查状态）属正常情况，返回空内容而非报错
                    if (this.is_missing_ref_file(e)) buf = null;
                    else throw e;
                }
            }
            if (!buf) return Sucess({text: "", binary: false, exists: false});
            const max_bytes = 1024 * 1024;
            // 二进制判定：含 NUL 字节；超大文件也按不可比较处理，避免 Ace 渲染卡死
            if (buf.length > max_bytes || buf.includes(0)) return Sucess({text: null, binary: true, exists: true});
            return Sucess({text: buf.toString("utf8"), binary: false, exists: true});
        } catch (e) {
            return Fail(this.err_msg(e));
        }
    }

    /** 判断 git show 失败是否属于「该版本下无此文件」 */
    private is_missing_ref_file(e: any): boolean {
        const msg = this.err_msg(e);
        return /does not exist|exists on disk, but not in|unknown revision|bad revision|Path .* does not exist|invalid object name/i.test(msg);
    }

    /**
     * 判断是否为冲突状态，git 冲突组合包括 DD/AU/UD/UA/DU/AA/UU
     */
    private isConflict(index: string, worktree: string): boolean {
        const pair = index + worktree;
        return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(pair);
    }

    /**
     * 执行 git 命令。
     * keep_raw=true 时原样返回 stdout，不做 trim：porcelain -z 等格式化输出对首尾空格敏感，
     * trim 会吃掉状态位导致解析错位（如 " M xxx" 被裁成 "M xxx"）。
     */
    private execGit(cwd: string, args: string, timeout = 30000, keep_raw = false): Promise<string> {
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
                    resolve(keep_raw ? stdout : stdout.trim());
                }
            });
        });
    }

    async gitStatus(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            // -z 用 \0 分隔且不对路径转义，避免文件名含空格/中文时解析错误
            // keep_raw=true：状态位可能是空格，不能 trim
            const output = await this.execGit(cwd, "status --porcelain -u -z", 30000, true);
            const files: GitStatusFile[] = [];
            if (output) {
                // -z 模式下重命名条目为 "XY 新路径\0旧路径"，所以按 \0 切分后需按状态判断是否多读一段
                const parts = output.split("\0");
                for (let i = 0; i < parts.length; i++) {
                    const entry = parts[i];
                    if (!entry) continue;
                    const index = entry[0];
                    const worktree = entry[1];
                    const filePath = entry.substring(3);
                    const conflicted = this.isConflict(index, worktree);
                    let oldPath: string | undefined;
                    // R/C 状态下，下一段是原路径
                    if (index === "R" || index === "C") {
                        oldPath = parts[++i];
                    }
                    files.push({
                        path: filePath,
                        index,
                        worktree,
                        staged: index !== " " && index !== "?",
                        untracked: index === "?" && worktree === "?",
                        conflicted,
                        oldPath,
                    });
                }
            }
            return Sucess(files);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitLog(token: string, relativePath: string, maxCount = 50, skip = 0): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            // %D 是 ref 名称列表，%p 是父提交（短 hash，与 %h 同长度，前端据此画树形血缘）
            const output = await this.execGit(cwd, `log --max-count=${maxCount} --skip=${skip} --format="%h%x1f%s%x1f%an%x1f%ad%x1f%D%x1f%p" --date=format:"%Y-%m-%d %H:%M"`);
            // 未推送到上游的提交集合；无上游分支时视为全部已推送
            const unpushed = await this.get_unpushed_set(cwd);
            const entries: GitLogEntry[] = [];
            if (output) {
                for (const line of output.split("\n")) {
                    const parts = line.split("\x1f");
                    if (parts.length < 6) continue;
                    entries.push({
                        hash: parts[0],
                        message: parts[1],
                        author: parts[2],
                        date: parts[3],
                        refs: parts[4] ? parts[4].split(",").map(s => s.trim()).filter(Boolean) : [],
                        parents: parts[5] ? parts[5].split(" ").filter(Boolean) : [],
                        unpushed: unpushed.has(parts[0]),
                    });
                }
            }
            return Sucess(entries);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 取「未推送到上游分支」的提交短 hash 集合（等价于 WebStorm 在提交记录里的斜体/箭头标记）。
     * 没有上游分支时返回空集合。
     */
    private async get_unpushed_set(cwd: string): Promise<Set<string>> {
        try {
            const output = await this.execGit(cwd, 'log --format="%h" @{u}..HEAD');
            return new Set(output ? output.split("\n").map(s => s.trim()).filter(Boolean) : []);
        } catch (e) {
            // 无上游分支（如本地新建分支）时不标记
            return new Set();
        }
    }

    async gitBranches(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            // --format 只取分支名，避免 "* " 前缀和颜色干扰解析
            const local = await this.execGit(cwd, 'branch --format="%(refname:short)"');
            const current = (await this.execGit(cwd, "rev-parse --abbrev-ref HEAD")).trim();
            const branches = local ? local.split("\n").map(s => s.trim()).filter(Boolean) : [];
            return Sucess({current, branches});
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    // ==================== 第二期：提交历史与分支管理 ====================

    /**
     * 提交详情：元信息 + 改动文件列表及增删行统计。
     * 用 --numstat 拿到每个文件的增删行数，配合 --name-status 拿状态。
     */
    async gitCommitDetail(token: string, relativePath: string, hash: string): Promise<Result<any>> {
        try {
            if (!hash) return Fail("hash is required");
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const safe_hash = hash.replace(/[^0-9a-zA-Z_.\-]/g, "");
            // 1. 元信息
            const meta = await this.execGit(cwd,
                `show -s --format="%H|%h|%s|%an|%ae|%ad|%P" --date=format:"%Y-%m-%d %H:%M:%S" ${safe_hash}`);
            const [full_hash, short_hash, subject, author, email, date, parents] = meta.split("|");
            // 2. 文件改动统计（--numstat 输出：新增行\t删除行\t文件路径）
            const numstat = await this.execGit(cwd, `show --numstat --format="" ${safe_hash}`);
            const files = [];
            for (const line of numstat.split("\n")) {
                if (!line.trim()) continue;
                const parts = line.split("\t");
                if (parts.length < 3) continue;
                files.push({
                    path: parts[2],
                    // 二进制文件用 "-" 表示
                    additions: parts[0] === "-" ? null : parseInt(parts[0], 10),
                    deletions: parts[1] === "-" ? null : parseInt(parts[1], 10),
                });
            }
            return Sucess({
                hash: full_hash,
                short_hash,
                subject,
                author,
                email,
                date,
                parents: parents ? parents.split(" ").filter(Boolean) : [],
                files,
            });
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 两个 revision 之间改动的文件列表（含增删行数），供分支比较等场景先列文件再看单个文件的 diff。
     */
    async gitDiffFiles(token: string, relativePath: string, from: string, to: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const range = `${this.clean_ref(from)}..${this.clean_ref(to)}`;
            // --numstat 输出：新增行\t删除行\t文件路径；二进制文件用 "-" 表示行数
            const output = await this.execGit(cwd, `diff --numstat ${range}`, 30000, true);
            const files = [];
            for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                const parts = line.split("\t");
                if (parts.length < 3) continue;
                files.push({
                    path: parts[2],
                    additions: parts[0] === "-" ? null : parseInt(parts[0], 10),
                    deletions: parts[1] === "-" ? null : parseInt(parts[1], 10),
                });
            }
            return Sucess(files);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 某次提交的 diff。指定 file 则只看该文件。
     */
    async gitCommitDiff(token: string, relativePath: string, hash: string, file?: string): Promise<Result<any>> {
        try {
            if (!hash) return Fail("hash is required");
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const safe_hash = hash.replace(/[^0-9a-zA-Z_.\-]/g, "");
            let args = `show --no-color -U3 --format="" ${safe_hash}`;
            if (file) args += ` -- "${file.replace(/"/g, '\\"')}"`;
            const output = await this.execGit(cwd, args);
            return Sucess(output || "");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 单文件提交历史。
     */
    async gitFileLog(token: string, relativePath: string, file: string, maxCount = 50): Promise<Result<any>> {
        try {
            if (!file) return Fail("file is required");
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd,
                `log --max-count=${maxCount} --format="%h|%s|%an|%ad" --date=format:"%Y-%m-%d %H:%M" -- "${file.replace(/"/g, '\\"')}"`);
            const entries = [];
            for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                const parts = line.split("|");
                if (parts.length >= 4) {
                    entries.push({hash: parts[0], message: parts[1], author: parts[2], date: parts[3]});
                }
            }
            return Sucess(entries);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 逐行归属（blame）。
     * --line-porcelain 输出格式固定，按块解析，每块以 <sha> 开头。
     */
    async gitBlame(token: string, relativePath: string, file: string): Promise<Result<any>> {
        try {
            if (!file) return Fail("file is required");
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd,
                `blame --line-porcelain -- "${file.replace(/"/g, '\\"')}"`, 60000);
            const lines = [];
            let current = null;
            for (const raw of output.split("\n")) {
                // 块首行：<sha> <原行号> <最终行号> [行数]
                if (/^[0-9a-f]{40} \d+ \d+/.test(raw)) {
                    if (current) lines.push(current);
                    current = {hash: raw.substring(0, 8), author: "", date: "", text: "", line_num: parseInt(raw.split(" ")[2], 10)};
                    continue;
                }
                if (!current) continue;
                if (raw.startsWith("author ")) current.author = raw.substring(7);
                else if (raw.startsWith("author-time ")) {
                    // 转成可读时间
                    current.date = new Date(parseInt(raw.substring(12), 10) * 1000)
                        .toISOString().replace("T", " ").substring(0, 16);
                } else if (raw.startsWith("\t")) {
                    // 以 tab 开头的是实际内容行，同时标志该块结束
                    current.text = raw.substring(1);
                }
            }
            if (current) lines.push(current);
            return Sucess(lines);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 创建分支并切换过去。
     */
    async gitBranchCreate(token: string, relativePath: string, name: string): Promise<Result<any>> {
        try {
            if (!name) return Fail("branch name is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd, `checkout -b "${name.replace(/"/g, '\\"')}"`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 删除分支。force=true 用于删除未合并分支。
     */
    async gitBranchDelete(token: string, relativePath: string, name: string, force = false): Promise<Result<any>> {
        try {
            if (!name) return Fail("branch name is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd, `branch ${force ? "-D" : "-d"} "${name.replace(/"/g, '\\"')}"`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 合并指定分支到当前分支。
     */
    async gitMerge(token: string, relativePath: string, branch: string): Promise<Result<any>> {
        try {
            if (!branch) return Fail("branch is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd, `merge "${branch.replace(/"/g, '\\"')}"`, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 解析远程分支名 `remote/branch`，并做字符白名单校验。
     * 拒绝空值、缺 remote 前缀、路径穿越（`.` `..`）与命令注入字符，非法返回 null。
     */
    private parse_remote_branch(remote_branch: string): { remote: string, branch: string } | null {
        if (!remote_branch) return null;
        const slash = remote_branch.indexOf("/");
        if (slash <= 0) return null;
        const remote = remote_branch.substring(0, slash);
        const branch = remote_branch.substring(slash + 1);
        if (!/^[0-9a-zA-Z_.\-]+$/.test(remote)) return null;
        // 分支名允许 / 分段，但每段都不能是 . 或 ..，且只允许字母数字与 _ - .
        if (!branch || !/^[0-9a-zA-Z_.\-/]+$/.test(branch)) return null;
        if (branch.split("/").some(s => s === "." || s === ".." || s === "")) return null;
        return {remote, branch};
    }

    /**
     * 删除远程分支（WebStorm 的 Delete Remote Branch）。
     * remote_branch 形如 origin/feature，会解析出 remote 名与分支名后执行 push <remote> --delete <branch>。
     */
    async gitRemoteBranchDelete(token: string, relativePath: string, remote_branch: string): Promise<Result<any>> {
        try {
            const parts = this.parse_remote_branch(remote_branch);
            if (!parts) return Fail("invalid remote branch name");
            const {remote, branch} = parts;
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd, `push ${remote} --delete "${branch}"`, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 重命名远程分支（WebStorm 的 Rename Remote Branch）。
     * 步骤：推送新分支名 → 删除旧的远程分支 → 若本地存在同名跟踪分支则改名并重设上游。
     */
    async gitRemoteBranchRename(token: string, relativePath: string, remote_branch: string, new_name: string): Promise<Result<any>> {
        try {
            const parts = this.parse_remote_branch(remote_branch);
            if (!parts) return Fail("invalid remote branch name");
            const {remote, branch: old_branch} = parts;
            const parts_new = this.parse_remote_branch(`${remote}/${new_name}`);
            if (!parts_new) return Fail("invalid branch name");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            // 1. 把远程分支的提交推到新的远程分支名
            await this.execGit(cwd, `push ${remote} "${remote}/${old_branch}:refs/heads/${parts_new.branch}"`, 60000);
            // 2. 删除旧的远程分支
            await this.execGit(cwd, `push ${remote} --delete "${old_branch}"`, 60000);
            // 3. 本地若存在同名跟踪分支，一并改名并指向新上游
            const local_list = await this.execGit(cwd, 'branch --format="%(refname:short)"');
            if (local_list.split("\n").map(s => s.trim()).includes(old_branch)) {
                await this.execGit(cwd, `branch -m "${old_branch}" "${parts_new.branch}"`);
                await this.execGit(cwd, `branch --set-upstream-to=${remote}/${parts_new.branch} "${parts_new.branch}"`);
            }
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 分支图：在 log 基础上附带每个提交的分支/标签引用。
     */
    async gitGraph(token: string, relativePath: string, maxCount = 80): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            // %D 是 ref 名称列表，%p 是父提交（短 hash，用于前端画连线）
            const output = await this.execGit(cwd,
                `log --max-count=${maxCount} --format="%h%x1f%s%x1f%an%x1f%ad%x1f%D%x1f%p" --date=format:"%Y-%m-%d %H:%M"`);
            const entries = [];
            for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                const parts = line.split("\x1f");
                if (parts.length < 6) continue;
                entries.push({
                    hash: parts[0],
                    message: parts[1],
                    author: parts[2],
                    date: parts[3],
                    refs: parts[4] ? parts[4].split(",").map(s => s.trim()).filter(Boolean) : [],
                    parents: parts[5] ? parts[5].split(" ").filter(Boolean) : [],
                });
            }
            return Sucess(entries);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitAdd(token: string, relativePath: string, files: string[]): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const fileArgs = files.map(f => `"${f}"`).join(" ");
            const output = await this.execGit(cwd, `add ${fileArgs}`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitAddAll(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const output = await this.execGit(cwd, "add -A");
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitReset(token: string, relativePath: string, files: string[]): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const fileArgs = files.map(f => `"${f}"`).join(" ");
            const output = await this.execGit(cwd, `reset HEAD ${fileArgs}`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitCommit(token: string, relativePath: string, message: string, allChanged = false): Promise<Result<any>> {
        try {
            if (!message || !message.trim()) {
                return Fail("commit message is required");
            }
            const cwd = this.resolveWritePath(token, relativePath);
            const msg = message.replace(/"/g, '\\"');

            if (allChanged) {
                // -a 模式：自动暂存所有「已跟踪」文件的修改并提交（不含未跟踪的新文件）
                const output = await this.execGit(cwd, `commit -am "${msg}"`);
                return Sucess(output || "ok");
            }

            // 普通模式：提交已暂存内容（暂存区为空时 git 自身会给出提示，不做前置拦截）
            const output = await this.execGit(cwd, `commit -m "${msg}"`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitPush(token: string, relativePath: string, force = false): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const args = force ? "push --force" : "push";
            const output = await this.execGit(cwd, args, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitPull(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const output = await this.execGit(cwd, "pull", 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitCheckout(token: string, relativePath: string, branch: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const output = await this.execGit(cwd, `checkout "${branch}"`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 获取 unified diff 文本，供前端渲染
     * @param file  相对仓库根的文件路径，不传则返回全部改动
     * @param staged  true 表示查看已暂存的改动，false 表示工作区未暂存的改动
     */
    async gitDiff(token: string, relativePath: string, file?: string, staged = false): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            // --no-color 避免输出含 ANSI 转义；-U3 保证上下文行数一致
            let args = "diff --no-color -U3";
            if (staged) args += " --cached";
            if (file) args += ` -- "${file.replace(/"/g, '\\"')}"`;
            const output = await this.execGit(cwd, args);
            return Sucess(output || "");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 已暂存的 diff（兼容旧调用方） */
    async gitDiffStaged(token: string, relativePath: string, file?: string): Promise<Result<any>> {
        return this.gitDiff(token, relativePath, file, true);
    }

    async gitCheckIgnore(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const gitDir = path.join(cwd, ".git");
            const exists = await FileUtil.access(gitDir).then(() => true).catch(() => false);
            return Sucess({hasGit: exists});
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitStash(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const output = await this.execGit(cwd, "stash");
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitStashPop(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const output = await this.execGit(cwd, "stash pop");
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 获取全局 git 用户配置（user.name、user.email） */
    async gitGetUserConfig(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            // 优先取全局配置，没有则取仓库级
            let name = await this.execGit(cwd, "config --global user.name").catch(() => "");
            if (!name) name = await this.execGit(cwd, "config user.name").catch(() => "");
            let email = await this.execGit(cwd, "config --global user.email").catch(() => "");
            if (!email) email = await this.execGit(cwd, "config user.email").catch(() => "");
            return Sucess({name: name || "", email: email || ""});
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 设置全局 git 用户配置 */
    async gitSetUserConfig(token: string, relativePath: string, name: string, email: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            if (name !== undefined && name !== null) {
                await this.execGit(cwd, `config --global user.name "${name.replace(/"/g, '\\"')}"`);
            }
            if (email !== undefined && email !== null) {
                await this.execGit(cwd, `config --global user.email "${email.replace(/"/g, '\\"')}"`);
            }
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 获取 git 代理设置（http.proxy、https.proxy），全局 + 仓库级 */
    async gitGetProxy(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const globalHttp = await this.execGit(cwd, "config --global http.proxy").catch(() => "");
            const globalHttps = await this.execGit(cwd, "config --global https.proxy").catch(() => "");
            const localHttp = await this.execGit(cwd, "config --local http.proxy").catch(() => "");
            const localHttps = await this.execGit(cwd, "config --local https.proxy").catch(() => "");
            return Sucess({
                global: {http: globalHttp || "", https: globalHttps || ""},
                local: {http: localHttp || "", https: localHttps || ""},
            });
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 设置 git 代理（scope: global | local；type: http | https；value 为空则清除） */
    async gitSetProxy(token: string, relativePath: string, scope: string, type: string, value: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const scopeFlag = scope === "local" ? "--local" : "--global";
            const key = `${type}.proxy`;
            if (value && value.trim()) {
                await this.execGit(cwd, `config ${scopeFlag} ${key} "${value.trim().replace(/"/g, '\\"')}"`);
            } else {
                // 值为空则清除该配置
                await this.execGit(cwd, `config ${scopeFlag} --unset ${key}`).catch(() => {});
            }
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    // ==================== 第三期：冲突 / 标签 / Stash / 远程 / 高级操作 ====================

    /**
     * 冲突文件列表。
     * porcelain -z 下 UU/AA/DD/AU/UA/DU/UD 均为冲突状态。
     */
    async gitConflicts(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd, "diff --name-only --diff-filter=U", 30000, true);
            const files = output.split("\n").map(s => s.trim()).filter(Boolean);
            // 同时给出可用的操作提示（merge 或 rebase 中）
            let state = "";
            try {
                const git_dir = (await this.execGit(cwd, "rev-parse --git-dir")).trim();
                const fs = require("fs");
                const path = require("path");
                const abs = path.isAbsolute(git_dir) ? git_dir : path.join(cwd, git_dir);
                if (fs.existsSync(path.join(abs, "MERGE_HEAD"))) state = "merge";
                else if (fs.existsSync(path.join(abs, "rebase-merge")) || fs.existsSync(path.join(abs, "rebase-apply"))) state = "rebase";
                else if (fs.existsSync(path.join(abs, "CHERRY_PICK_HEAD"))) state = "cherry-pick";
                else if (fs.existsSync(path.join(abs, "REVERT_HEAD"))) state = "revert";
            } catch (e) {
                // 状态探测失败不影响冲突列表返回
            }
            return Sucess({files, state});
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 解决冲突：采用某侧版本或标记为已解决。
     * side: ours | theirs，resolved 表示仅 git add 标记已手动解决
     */
    async gitResolveConflict(token: string, relativePath: string, file: string, side: string): Promise<Result<any>> {
        try {
            if (!file) return Fail("file is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const safe = file.replace(/"/g, '\\"');
            if (side === "ours" || side === "theirs") {
                await this.execGit(cwd, `checkout --${side} -- "${safe}"`);
            }
            await this.execGit(cwd, `add -- "${safe}"`);
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 结束冲突处理流程。
     * action: merge_abort | rebase_abort | cherry_pick_abort | revert_abort | merge_continue
     */
    async gitConflictAction(token: string, relativePath: string, action: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const map: Record<string, string> = {
                merge_abort: "merge --abort",
                rebase_abort: "rebase --abort",
                cherry_pick_abort: "cherry-pick --abort",
                revert_abort: "revert --abort",
                merge_continue: "commit --no-edit",
            };
            const cmd = map[action];
            if (!cmd) return Fail("unknown action");
            const output = await this.execGit(cwd, cmd, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 标签列表，按创建时间倒序 */
    async gitTags(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd,
                'tag --sort=-creatordate --format="%(refname:short)|%(objectname:short)|%(subject)|%(creatordate:format:%Y-%m-%d %H:%M)"');
            const tags = [];
            for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                const p = line.split("|");
                if (p.length >= 4) tags.push({name: p[0], hash: p[1], message: p[2], date: p[3]});
            }
            return Sucess(tags);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 创建标签。带 message 则创建附注标签 */
    async gitTagCreate(token: string, relativePath: string, name: string, message: string, hash?: string): Promise<Result<any>> {
        try {
            if (!name) return Fail("tag name is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const safe_name = name.replace(/"/g, '\\"');
            const target = hash ? ` "${hash.replace(/"/g, '\\"')}"` : "";
            const cmd = message
                ? `tag -a "${safe_name}" -m "${message.replace(/"/g, '\\"')}"${target}`
                : `tag "${safe_name}"${target}`;
            await this.execGit(cwd, cmd);
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitTagDelete(token: string, relativePath: string, name: string): Promise<Result<any>> {
        try {
            if (!name) return Fail("tag name is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            await this.execGit(cwd, `tag -d "${name.replace(/"/g, '\\"')}"`);
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * stash 列表。
     * stash@{0}|分支名|说明|时间
     */
    async gitStashList(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd,
                'stash list --format="%gd|%gs|%ci"');
            const stashes = [];
            for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                const p = line.split("|");
                if (p.length >= 3) stashes.push({ref: p[0], message: p[1], date: p[2]});
            }
            return Sucess(stashes);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 应用指定 stash。pop=true 为应用并删除 */
    async gitStashApply(token: string, relativePath: string, ref: string, pop: boolean): Promise<Result<any>> {
        try {
            if (!ref) return Fail("stash ref is required");
            // 只允许 stash@{n} 形式，防命令注入
            if (!/^stash@\{\d+\}$/.test(ref)) return Fail("invalid stash ref");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd, `stash ${pop ? "pop" : "apply"} "${ref}"`, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    async gitStashDrop(token: string, relativePath: string, ref: string): Promise<Result<any>> {
        try {
            if (!/^stash@\{\d+\}$/.test(ref)) return Fail("invalid stash ref");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            await this.execGit(cwd, `stash drop "${ref}"`);
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 远程分支列表。
     * 从 remote refs 解析，排除 HEAD 指向。
     */
    async gitRemoteBranches(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd,
                'for-each-ref --format="%(refname:short)|%(objectname:short)|%(committerdate:format:%Y-%m-%d %H:%M)" refs/remotes');
            const branches = [];
            for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                const p = line.split("|");
                if (p.length < 3) continue;
                // 排除 origin/HEAD 这类符号引用，以及 origin 本身（/ 后没有分支名的 remote 根 ref）
                if (p[0].endsWith("/HEAD") || !p[0].includes("/")) continue;
                branches.push({name: p[0], hash: p[1], date: p[2]});
            }
            let remotes = [];
            try {
                const r = await this.execGit(cwd, "remote");
                remotes = r.split("\n").map(s => s.trim()).filter(Boolean);
            } catch (e) {
                // 无远程仓库时保持空数组
            }
            return Sucess({branches, remotes});
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 拉取远程信息（不合并），用于更新远程分支列表 */
    async gitFetch(token: string, relativePath: string, prune = false): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd, prune ? "fetch --all --prune" : "fetch --all", 120000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 签出远程分支到本地同名分支。
     * 若本地已存在则直接切换。
     */
    async gitCheckoutRemote(token: string, relativePath: string, remote_branch: string): Promise<Result<any>> {
        try {
            if (!remote_branch) return Fail("remote branch is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            // 本地分支名取远程分支去掉 remote 前缀后的部分
            const slash = remote_branch.indexOf("/");
            const local_name = slash >= 0 ? remote_branch.substring(slash + 1) : remote_branch;
            const local_list = await this.execGit(cwd, 'branch --format="%(refname:short)"');
            const exists = local_list.split("\n").map(s => s.trim()).includes(local_name);
            const safe = remote_branch.replace(/"/g, '\\"');
            const output = exists
                ? await this.execGit(cwd, `checkout "${local_name}"`)
                : await this.execGit(cwd, `checkout -b "${local_name}" --track "${safe}"`);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 按关键词/作者搜索提交。
     * keyword 走 --grep，author 走 --author，两者可组合。
     */
    async gitSearchCommit(token: string, relativePath: string, keyword: string, author: string, maxCount = 100): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            let args = `log --max-count=${maxCount} --format="%h%x1f%s%x1f%an%x1f%ad%x1f%D%x1f%p" --date=format:"%Y-%m-%d %H:%M"`;
            if (keyword && keyword.trim()) args += ` --grep="${keyword.trim().replace(/"/g, '\\"')}" -i`;
            if (author && author.trim()) args += ` --author="${author.trim().replace(/"/g, '\\"')}" -i`;
            const output = await this.execGit(cwd, args);
            const unpushed = await this.get_unpushed_set(cwd);
            const entries = [];
            for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                const p = line.split("\x1f");
                if (p.length < 6) continue;
                entries.push({
                    hash: p[0],
                    message: p[1],
                    author: p[2],
                    date: p[3],
                    refs: p[4] ? p[4].split(",").map(s => s.trim()).filter(Boolean) : [],
                    parents: p[5] ? p[5].split(" ").filter(Boolean) : [],
                    unpushed: unpushed.has(p[0]),
                });
            }
            return Sucess(entries);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 任意两个引用之间的 diff。
     * from 为空时与工作区比较，to 为空时为 HEAD。
     */
    async gitDiffCommits(token: string, relativePath: string, from: string, to: string, file?: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const safe = (s: string) => s.replace(/[^0-9a-zA-Z_./\-~^]/g, "");
            let args = "diff --no-color -U3";
            const f = from ? safe(from) : "";
            const t = to ? safe(to) : "HEAD";
            if (f) args += ` "${f}" "${t}"`;
            else args += ` "${t}"`;
            if (file) args += ` -- "${file.replace(/"/g, '\\"')}"`;
            const output = await this.execGit(cwd, args, 60000);
            return Sucess(output || "");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 撤销某个提交，生成一个反向提交 */
    async gitRevert(token: string, relativePath: string, hash: string): Promise<Result<any>> {
        try {
            if (!hash) return Fail("hash is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const safe = hash.replace(/[^0-9a-zA-Z_.\-]/g, "");
            const output = await this.execGit(cwd, `revert --no-edit "${safe}"`, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 把指定提交摘到当前分支 */
    async gitCherryPick(token: string, relativePath: string, hash: string): Promise<Result<any>> {
        try {
            if (!hash) return Fail("hash is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const safe = hash.replace(/[^0-9a-zA-Z_.\-]/g, "");
            const output = await this.execGit(cwd, `cherry-pick "${safe}"`, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 删除已合并到远程的 tag（仅本地删除，推送需另行操作） */
    async gitPushTag(token: string, relativePath: string, name: string): Promise<Result<any>> {
        try {
            if (!name) return Fail("tag name is required");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            await this.execGit(cwd, `push origin "${name.replace(/"/g, '\\"')}"`, 120000);
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    // ==================== 第四期：reflog / 提交粒度操作 / 仓库信息 / 子模块 / Hook ====================

    /**
     * reflog：HEAD 移动的全部记录，用于误操作后的恢复定位。
     * 每行取 short hash + reflog 描述（含 HEAD@{n}）+ 时间。
     */
    async gitReflog(token: string, relativePath: string, maxCount = 100): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd,
                `reflog --max-count=${maxCount} --format="%h|%gd|%gs|%ci"`);
            const entries = [];
            for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                const p = line.split("|");
                if (p.length >= 4) entries.push({hash: p[0], selector: p[1], message: p[2], date: p[3]});
            }
            return Sucess(entries);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 回退到指定提交。
     * mode: soft（保留改动在暂存区）| mixed（保留改动在工作区）| hard（丢弃改动）
     */
    async gitResetCommit(token: string, relativePath: string, hash: string, mode: string): Promise<Result<any>> {
        try {
            if (!hash) return Fail("hash is required");
            if (!["soft", "mixed", "hard"].includes(mode)) return Fail("invalid mode");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const safe = hash.replace(/[^0-9a-zA-Z_.\-{}@]/g, "");
            const output = await this.execGit(cwd, `reset --${mode} "${safe}"`, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 仓库概览：当前 HEAD、远程地址、仓库路径、是否处于特殊状态。
     * 供页面顶部展示，也用于判断能否执行 reset 等危险操作。
     */
    async gitRepoInfo(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const branch = (await this.execGit(cwd, "rev-parse --abbrev-ref HEAD")).trim();
            const head_hash = (await this.execGit(cwd, "rev-parse --short HEAD")).trim();
            let remote_url = "";
            try {
                remote_url = (await this.execGit(cwd, "remote get-url origin")).trim();
            } catch (e) {
                // 未配置 remote 时保持空串
            }
            // 与远程的领先/落后数量
            let ahead = 0, behind = 0;
            try {
                const counts = (await this.execGit(cwd,
                    `rev-list --left-right --count origin/${branch}...HEAD`)).trim();
                const p = counts.split(/\s+/);
                behind = parseInt(p[0], 10) || 0;
                ahead = parseInt(p[1], 10) || 0;
            } catch (e) {
                // 无上游分支时无法比较
            }
            return Sucess({branch, head_hash, remote_url, ahead, behind, path: cwd});
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 某提交的文件 与 当前工作区 的差异。
     * 用于对比历史版本与当前内容。
     */
    async gitDiffWithWorktree(token: string, relativePath: string, hash: string, file: string): Promise<Result<any>> {
        try {
            if (!hash) return Fail("hash is required");
            if (!file) return Fail("file is required");
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const safe = hash.replace(/[^0-9a-zA-Z_.\-{}@]/g, "");
            const output = await this.execGit(cwd,
                `diff --no-color -U3 "${safe}" -- "${file.replace(/"/g, '\\"')}"`, 60000);
            return Sucess(output || "");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 子模块列表。
     * git submodule status 每行格式：<状态符><hash> <路径> (<描述>)
     */
    async gitSubmodules(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            let raw = "";
            try {
                raw = await this.execGit(cwd, "submodule status");
            } catch (e) {
                // 无 .gitmodules 时 git 返回非零，视为无子模块
                return Sucess([]);
            }
            const list = [];
            for (const line of raw.split("\n")) {
                if (!line.trim()) continue;
                // 首个字符是状态：'-'未初始化，'+'与记录不一致，' '正常
                const flag = line[0];
                const rest = line.substring(1).trim();
                const space_idx = rest.indexOf(" ");
                if (space_idx < 0) continue;
                const hash_ = rest.substring(0, space_idx);
                const tail = rest.substring(space_idx + 1);
                const paren = tail.indexOf(" (");
                const path_ = paren >= 0 ? tail.substring(0, paren) : tail;
                const desc = paren >= 0 ? tail.substring(paren + 2).replace(/\)$/, "") : "";
                list.push({
                    path: path_,
                    hash: hash_,
                    desc,
                    status: flag === "-" ? "uninitialized" : flag === "+" ? "modified" : "ok",
                });
            }
            return Sucess(list);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 初始化并更新所有子模块 */
    async gitSubmoduleUpdate(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const output = await this.execGit(cwd, "submodule update --init --recursive", 300000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 常用 hook 列表。只返回被 git 识别为可执行的示例文件名 */
    private static readonly HOOK_NAMES = [
        "pre-commit", "prepare-commit-msg", "commit-msg", "post-commit",
        "pre-push", "pre-rebase", "post-merge", "post-checkout",
    ];

    /**
     * 读取指定 hook 内容。
     * 优先读 hooks/<name>，不存在则读 hooks/<name>.sample 作为模板。
     */
    async gitHookRead(token: string, relativePath: string, name: string): Promise<Result<any>> {
        try {
            if (!GitServiceImpl.HOOK_NAMES.includes(name)) return Fail("unknown hook");
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const git_dir = (await this.execGit(cwd, "rev-parse --git-dir")).trim();
            const fs = require("fs");
            const path = require("path");
            const abs_git = path.isAbsolute(git_dir) ? git_dir : path.join(cwd, git_dir);
            const hooks_dir = path.join(abs_git, "hooks");
            const real = path.join(hooks_dir, name);
            const sample = real + ".sample";
            if (fs.existsSync(real)) {
                return Sucess({content: fs.readFileSync(real, "utf8"), enabled: true, sample: false});
            }
            if (fs.existsSync(sample)) {
                return Sucess({content: fs.readFileSync(sample, "utf8"), enabled: false, sample: true});
            }
            return Sucess({content: "", enabled: false, sample: false});
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 保存 hook 内容并赋予可执行权限。
     */
    async gitHookSave(token: string, relativePath: string, name: string, content: string): Promise<Result<any>> {
        try {
            if (!GitServiceImpl.HOOK_NAMES.includes(name)) return Fail("unknown hook");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const git_dir = (await this.execGit(cwd, "rev-parse --git-dir")).trim();
            const fs = require("fs");
            const path = require("path");
            const abs_git = path.isAbsolute(git_dir) ? git_dir : path.join(cwd, git_dir);
            const hooks_dir = path.join(abs_git, "hooks");
            if (!fs.existsSync(hooks_dir)) fs.mkdirSync(hooks_dir, {recursive: true});
            const target = path.join(hooks_dir, name);
            fs.writeFileSync(target, content, "utf8");
            // git 只执行有可执行权限的 hook
            fs.chmodSync(target, 0o755);
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 禁用 hook（删除文件），恢复到无 hook 状态 */
    async gitHookDelete(token: string, relativePath: string, name: string): Promise<Result<any>> {
        try {
            if (!GitServiceImpl.HOOK_NAMES.includes(name)) return Fail("unknown hook");
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const git_dir = (await this.execGit(cwd, "rev-parse --git-dir")).trim();
            const fs = require("fs");
            const path = require("path");
            const abs_git = path.isAbsolute(git_dir) ? git_dir : path.join(cwd, git_dir);
            const target = path.join(abs_git, "hooks", name);
            if (fs.existsSync(target)) fs.unlinkSync(target);
            return Sucess("ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /** 所有 hook 的启用状态概览 */
    async gitHookList(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const git_dir = (await this.execGit(cwd, "rev-parse --git-dir")).trim();
            const fs = require("fs");
            const path = require("path");
            const abs_git = path.isAbsolute(git_dir) ? git_dir : path.join(cwd, git_dir);
            const hooks_dir = path.join(abs_git, "hooks");
            const list = GitServiceImpl.HOOK_NAMES.map(name => ({
                name,
                enabled: fs.existsSync(path.join(hooks_dir, name)),
                has_sample: fs.existsSync(path.join(hooks_dir, name + ".sample")),
            }));
            return Sucess(list);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    // ==================== 第五期：amend / 仓库管理 / 克隆 ====================

    /**
     * 修改最后一次提交。
     * 传 message 则改信息；不传则保持原信息（配合已暂存内容追加到上次提交）。
     */
    async gitCommitAmend(token: string, relativePath: string, message: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            await this.ensureGitRepo(cwd);
            const cmd = message && message.trim()
                ? `commit --amend -m "${message.trim().replace(/"/g, '\\"')}"`
                : "commit --amend --no-edit";
            const output = await this.execGit(cwd, cmd, 60000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 初始化仓库（空目录转成 git 仓库）。
     * 已存在仓库时直接返回成功，不重复初始化。
     */
    async gitInit(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolveWritePath(token, relativePath);
            const git_dir = path.join(cwd, ".git");
            const exists = await FileUtil.access(git_dir).then(() => true).catch(() => false);
            if (exists) return Sucess("already initialized");
            const output = await this.execGit(cwd, "init", 30000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 克隆远程仓库到指定目录。
     * 目标目录必须不存在或为空，避免覆盖已有内容。
     * target 是相对用户根目录的路径，最后一段作为仓库目录名。
     */
    async gitClone(token: string, target: string, url: string): Promise<Result<any>> {
        try {
            if (!url) return Fail("url is required");
            if (!target) return Fail("target is required");
            const root = settingService.getFileRootPath(token);
            const abs = path.resolve(root, decodeURIComponent(target));
            if (!userService.isSubPath(root, abs)) return Fail("path is invalid");
            userService.check_user_path(token, abs);
            userService.check_user_only_path(token, abs);
            // 目标已存在且有内容则拒绝，防止覆盖
            const targets = await FileUtil.readdirSync(abs).catch(() => null);
            if (targets && targets.length > 0) return Fail("target directory is not empty");
            // 父目录必须存在，避免路径写错时静默创建深层目录
            const parent = path.dirname(abs);
            if (!await FileUtil.access(parent)) return Fail("target parent directory does not exist");
            // 代理配置沿用 git 全局配置，git 自身会读取
            const output = await this.execGit(parent, `clone "${url.replace(/"/g, '\\"')}" "${path.basename(abs)}"`, 600000);
            return Sucess(output || "ok");
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 用 git 命令（而非递归扫盘）列出指定目录下的仓库。
     * 只查一层，避免大目录下递归过慢；返回每个仓库的目录名与相对路径。
     */
    async gitListRepos(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const entries = await FileUtil.readdirSync(cwd).catch(() => []);
            const repos = [];
            for (const name of entries) {
                // 跳过隐藏目录，node_modules 等明显不是仓库的位置
                if (name.startsWith(".")) continue;
                const sub = path.join(cwd, name);
                // 只处理含 .git 的目录
                if (!await FileUtil.access(path.join(sub, ".git"))) continue;
                let branch = "";
                try {
                    branch = (await this.execGit(sub, "rev-parse --abbrev-ref HEAD", 10000)).trim();
                } catch (e) {
                    // 无提交的仓库获取分支会失败，保持空串
                }
                repos.push({name, path: sub, branch});
            }
            return Sucess(repos);
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }

    /**
     * 列出当前目录下所有子目录，供新建仓库时选择位置。
     */
    async gitListDirs(token: string, relativePath: string): Promise<Result<any>> {
        try {
            const cwd = this.resolvePath(token, relativePath);
            const entries = await FileUtil.readdirSync(cwd).catch(() => []);
            const dirs = [];
            for (const name of entries) {
                if (name.startsWith(".")) continue;
                const sub = path.join(cwd, name);
                // readdir 能成功即说明是目录（对文件会抛错）
                const is_dir = await FileUtil.readdirSync(sub).then(() => true).catch(() => false);
                if (is_dir) dirs.push(name);
            }
            return Sucess({path: cwd, dirs});
        } catch (e: any) {
            return Fail(this.err_msg(e));
        }
    }
}

export const gitService = new GitServiceImpl();
