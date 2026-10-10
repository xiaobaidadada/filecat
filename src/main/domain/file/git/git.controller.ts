import {JsonController, Post, Body, Req} from "routing-controllers";
import {gitService} from "./git.service";
import {Result} from "../../../other/Result";

@JsonController("/git")
export class GitController {

    @Post("/check_ignore")
    async checkIgnore(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitCheckIgnore(ctx.headers.authorization, data.path);
    }

    @Post("/status")
    async status(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitStatus(ctx.headers.authorization, data.path);
    }

    @Post("/log")
    async log(@Req() ctx, @Body() data: { path: string; maxCount?: number; skip?: number }): Promise<Result<any>> {
        return gitService.gitLog(ctx.headers.authorization, data.path, data.maxCount, data.skip);
    }

    @Post("/branches")
    async branches(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitBranches(ctx.headers.authorization, data.path);
    }

    // ==================== 第二期：提交历史与分支管理 ====================
    @Post("/commit_detail")
    async commitDetail(@Req() ctx, @Body() data: { path: string; hash: string }): Promise<Result<any>> {
        return gitService.gitCommitDetail(ctx.headers.authorization, data.path, data.hash);
    }

    @Post("/commit_diff")
    async commitDiff(@Req() ctx, @Body() data: { path: string; hash: string; file?: string }): Promise<Result<any>> {
        return gitService.gitCommitDiff(ctx.headers.authorization, data.path, data.hash, data.file);
    }

    @Post("/file_log")
    async fileLog(@Req() ctx, @Body() data: { path: string; file: string; maxCount?: number }): Promise<Result<any>> {
        return gitService.gitFileLog(ctx.headers.authorization, data.path, data.file, data.maxCount);
    }

    @Post("/blame")
    async blame(@Req() ctx, @Body() data: { path: string; file: string }): Promise<Result<any>> {
        return gitService.gitBlame(ctx.headers.authorization, data.path, data.file);
    }

    @Post("/branch_create")
    async branchCreate(@Req() ctx, @Body() data: { path: string; name: string }): Promise<Result<any>> {
        return gitService.gitBranchCreate(ctx.headers.authorization, data.path, data.name);
    }

    @Post("/branch_delete")
    async branchDelete(@Req() ctx, @Body() data: { path: string; name: string; force?: boolean }): Promise<Result<any>> {
        return gitService.gitBranchDelete(ctx.headers.authorization, data.path, data.name, data.force);
    }

    @Post("/merge")
    async merge(@Req() ctx, @Body() data: { path: string; branch: string }): Promise<Result<any>> {
        return gitService.gitMerge(ctx.headers.authorization, data.path, data.branch);
    }

    @Post("/graph")
    async graph(@Req() ctx, @Body() data: { path: string; maxCount?: number }): Promise<Result<any>> {
        return gitService.gitGraph(ctx.headers.authorization, data.path, data.maxCount);
    }

    // ==================== 第三期：冲突 / 标签 / Stash / 远程 / 高级操作 ====================
    @Post("/conflicts")
    async conflicts(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitConflicts(ctx.headers.authorization, data.path);
    }

    @Post("/resolve")
    async resolve(@Req() ctx, @Body() data: { path: string; file: string; side: string }): Promise<Result<any>> {
        return gitService.gitResolveConflict(ctx.headers.authorization, data.path, data.file, data.side);
    }

    @Post("/conflict_action")
    async conflictAction(@Req() ctx, @Body() data: { path: string; action: string }): Promise<Result<any>> {
        return gitService.gitConflictAction(ctx.headers.authorization, data.path, data.action);
    }

    @Post("/tags")
    async tags(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitTags(ctx.headers.authorization, data.path);
    }

    @Post("/tag_create")
    async tagCreate(@Req() ctx, @Body() data: { path: string; name: string; message: string; hash?: string }): Promise<Result<any>> {
        return gitService.gitTagCreate(ctx.headers.authorization, data.path, data.name, data.message, data.hash);
    }

    @Post("/tag_delete")
    async tagDelete(@Req() ctx, @Body() data: { path: string; name: string }): Promise<Result<any>> {
        return gitService.gitTagDelete(ctx.headers.authorization, data.path, data.name);
    }

    @Post("/tag_push")
    async tagPush(@Req() ctx, @Body() data: { path: string; name: string }): Promise<Result<any>> {
        return gitService.gitPushTag(ctx.headers.authorization, data.path, data.name);
    }

    @Post("/stash_list")
    async stashList(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitStashList(ctx.headers.authorization, data.path);
    }

    @Post("/stash_apply")
    async stashApply(@Req() ctx, @Body() data: { path: string; ref: string; pop: boolean }): Promise<Result<any>> {
        return gitService.gitStashApply(ctx.headers.authorization, data.path, data.ref, data.pop);
    }

    @Post("/stash_drop")
    async stashDrop(@Req() ctx, @Body() data: { path: string; ref: string }): Promise<Result<any>> {
        return gitService.gitStashDrop(ctx.headers.authorization, data.path, data.ref);
    }

    @Post("/remote_branches")
    async remoteBranches(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitRemoteBranches(ctx.headers.authorization, data.path);
    }

    @Post("/fetch")
    async fetch(@Req() ctx, @Body() data: { path: string; prune?: boolean }): Promise<Result<any>> {
        return gitService.gitFetch(ctx.headers.authorization, data.path, data.prune);
    }

    @Post("/checkout_remote")
    async checkoutRemote(@Req() ctx, @Body() data: { path: string; branch: string }): Promise<Result<any>> {
        return gitService.gitCheckoutRemote(ctx.headers.authorization, data.path, data.branch);
    }

    @Post("/remote_branch_delete")
    async remoteBranchDelete(@Req() ctx, @Body() data: { path: string; branch: string }): Promise<Result<any>> {
        return gitService.gitRemoteBranchDelete(ctx.headers.authorization, data.path, data.branch);
    }

    @Post("/remote_branch_rename")
    async remoteBranchRename(@Req() ctx, @Body() data: { path: string; branch: string; new_name: string }): Promise<Result<any>> {
        return gitService.gitRemoteBranchRename(ctx.headers.authorization, data.path, data.branch, data.new_name);
    }

    @Post("/search_commit")
    async searchCommit(@Req() ctx, @Body() data: { path: string; keyword: string; author: string; maxCount?: number }): Promise<Result<any>> {
        return gitService.gitSearchCommit(ctx.headers.authorization, data.path, data.keyword, data.author, data.maxCount);
    }

    @Post("/diff_commits")
    async diffCommits(@Req() ctx, @Body() data: { path: string; from: string; to: string; file?: string }): Promise<Result<any>> {
        return gitService.gitDiffCommits(ctx.headers.authorization, data.path, data.from, data.to, data.file);
    }

    @Post("/revert")
    async revert(@Req() ctx, @Body() data: { path: string; hash: string }): Promise<Result<any>> {
        return gitService.gitRevert(ctx.headers.authorization, data.path, data.hash);
    }

    @Post("/cherry_pick")
    async cherryPick(@Req() ctx, @Body() data: { path: string; hash: string }): Promise<Result<any>> {
        return gitService.gitCherryPick(ctx.headers.authorization, data.path, data.hash);
    }

    // ==================== 第四期：reflog / 仓库信息 / 子模块 / Hook ====================
    @Post("/reflog")
    async reflog(@Req() ctx, @Body() data: { path: string; maxCount?: number }): Promise<Result<any>> {
        return gitService.gitReflog(ctx.headers.authorization, data.path, data.maxCount);
    }

    @Post("/reset_commit")
    async resetCommit(@Req() ctx, @Body() data: { path: string; hash: string; mode: string }): Promise<Result<any>> {
        return gitService.gitResetCommit(ctx.headers.authorization, data.path, data.hash, data.mode);
    }

    @Post("/repo_info")
    async repoInfo(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitRepoInfo(ctx.headers.authorization, data.path);
    }

    @Post("/diff_with_worktree")
    async diffWithWorktree(@Req() ctx, @Body() data: { path: string; hash: string; file: string }): Promise<Result<any>> {
        return gitService.gitDiffWithWorktree(ctx.headers.authorization, data.path, data.hash, data.file);
    }

    @Post("/submodules")
    async submodules(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitSubmodules(ctx.headers.authorization, data.path);
    }

    @Post("/submodule_update")
    async submoduleUpdate(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitSubmoduleUpdate(ctx.headers.authorization, data.path);
    }

    @Post("/hooks")
    async hooks(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitHookList(ctx.headers.authorization, data.path);
    }

    @Post("/hook_read")
    async hookRead(@Req() ctx, @Body() data: { path: string; name: string }): Promise<Result<any>> {
        return gitService.gitHookRead(ctx.headers.authorization, data.path, data.name);
    }

    @Post("/hook_save")
    async hookSave(@Req() ctx, @Body() data: { path: string; name: string; content: string }): Promise<Result<any>> {
        return gitService.gitHookSave(ctx.headers.authorization, data.path, data.name, data.content);
    }

    @Post("/hook_delete")
    async hookDelete(@Req() ctx, @Body() data: { path: string; name: string }): Promise<Result<any>> {
        return gitService.gitHookDelete(ctx.headers.authorization, data.path, data.name);
    }

    // ==================== 第五期：amend / 仓库管理 / 克隆 ====================
    @Post("/commit_amend")
    async commitAmend(@Req() ctx, @Body() data: { path: string; message: string }): Promise<Result<any>> {
        return gitService.gitCommitAmend(ctx.headers.authorization, data.path, data.message);
    }

    @Post("/init")
    async init(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitInit(ctx.headers.authorization, data.path);
    }

    @Post("/clone")
    async clone(@Req() ctx, @Body() data: { target: string; url: string }): Promise<Result<any>> {
        return gitService.gitClone(ctx.headers.authorization, data.target, data.url);
    }

    @Post("/repos")
    async repos(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitListRepos(ctx.headers.authorization, data.path);
    }

    @Post("/dirs")
    async dirs(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitListDirs(ctx.headers.authorization, data.path);
    }

    @Post("/add")
    async add(@Req() ctx, @Body() data: { path: string; files: string[] }): Promise<Result<any>> {
        return gitService.gitAdd(ctx.headers.authorization, data.path, data.files);
    }

    @Post("/add_all")
    async addAll(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitAddAll(ctx.headers.authorization, data.path);
    }

    @Post("/reset")
    async reset(@Req() ctx, @Body() data: { path: string; files: string[] }): Promise<Result<any>> {
        return gitService.gitReset(ctx.headers.authorization, data.path, data.files);
    }

    @Post("/commit")
    async commit(@Req() ctx, @Body() data: { path: string; message: string; allChanged?: boolean }): Promise<Result<any>> {
        return gitService.gitCommit(ctx.headers.authorization, data.path, data.message, data.allChanged);
    }

    @Post("/push")
    async push(@Req() ctx, @Body() data: { path: string; force?: boolean }): Promise<Result<any>> {
        return gitService.gitPush(ctx.headers.authorization, data.path, data.force);
    }

    @Post("/pull")
    async pull(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitPull(ctx.headers.authorization, data.path);
    }

    @Post("/checkout")
    async checkout(@Req() ctx, @Body() data: { path: string; branch: string }): Promise<Result<any>> {
        return gitService.gitCheckout(ctx.headers.authorization, data.path, data.branch);
    }

    @Post("/diff")
    async diff(@Req() ctx, @Body() data: { path: string; file?: string; staged?: boolean }): Promise<Result<any>> {
        return gitService.gitDiff(ctx.headers.authorization, data.path, data.file, data.staged);
    }

    @Post("/diff_staged")
    async diffStaged(@Req() ctx, @Body() data: { path: string; file?: string }): Promise<Result<any>> {
        return gitService.gitDiffStaged(ctx.headers.authorization, data.path, data.file);
    }

    @Post("/stash")
    async stash(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitStash(ctx.headers.authorization, data.path);
    }

    @Post("/stash_pop")
    async stashPop(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitStashPop(ctx.headers.authorization, data.path);
    }

    @Post("/get_user_config")
    async getUserConfig(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitGetUserConfig(ctx.headers.authorization, data.path);
    }

    @Post("/set_user_config")
    async setUserConfig(@Req() ctx, @Body() data: { path: string; name?: string; email?: string }): Promise<Result<any>> {
        return gitService.gitSetUserConfig(ctx.headers.authorization, data.path, data.name, data.email);
    }

    @Post("/get_proxy")
    async getProxy(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitGetProxy(ctx.headers.authorization, data.path);
    }

    @Post("/set_proxy")
    async setProxy(@Req() ctx, @Body() data: { path: string; scope: string; type: string; value: string }): Promise<Result<any>> {
        return gitService.gitSetProxy(ctx.headers.authorization, data.path, data.scope, data.type, data.value);
    }
}
