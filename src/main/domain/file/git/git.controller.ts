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
    async log(@Req() ctx, @Body() data: { path: string; maxCount?: number }): Promise<Result<any>> {
        return gitService.gitLog(ctx.headers.authorization, data.path, data.maxCount);
    }

    @Post("/branches")
    async branches(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitBranches(ctx.headers.authorization, data.path);
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
    async diff(@Req() ctx, @Body() data: { path: string; file?: string }): Promise<Result<any>> {
        return gitService.gitDiff(ctx.headers.authorization, data.path, data.file);
    }

    @Post("/diff_staged")
    async diffStaged(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitDiffStaged(ctx.headers.authorization, data.path);
    }

    @Post("/stash")
    async stash(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitStash(ctx.headers.authorization, data.path);
    }

    @Post("/stash_pop")
    async stashPop(@Req() ctx, @Body() data: { path: string }): Promise<Result<any>> {
        return gitService.gitStashPop(ctx.headers.authorization, data.path);
    }
}
