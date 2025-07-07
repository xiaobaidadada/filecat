// 定义一个控制器
import {Body, Delete, Get, JsonController, Param, Post, Put, QueryParam, Req, Res} from "routing-controllers";
import {
    base64UploadType,
    FileCompressPojo,
    FileTypeEnum,
    FileVideoFormatTransPojo,
    GetFilePojo,
    LogViewerPojo
} from "../../../common/file.pojo";
import {FileServiceImpl} from "./file.service";
import {Fail, Result, Sucess} from "../../other/Result";
import {
    cutCopyReq,
    fileInfoReq,
    saveTxtReq,
    WorkflowGetReq,
    WorkFlowRealTimeOneReq,
    WorkFlowRealTimeReq,
    WorkflowReq,
    ws_file_upload_req
} from "../../../common/req/file.req";
import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {settingService} from "../setting/setting.service";
import {Request, Response} from 'express';
import {search_file, search_file_cancel} from "./search/file.search";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {workflowService} from "./workflow/workflow.service";
import {Wss} from "../../../common/frame/ws.server";
import path from "path";


@JsonController("/file")
export class FileController {


    @Get()
    async getRootFile(@Req() ctx): Promise<Result<GetFilePojo | string>> {
        return await FileServiceImpl.getFile('', ctx.headers.authorization);
    }

    @Get('/:path([^"]{0,})')
    async getFile(@Req() ctx, @Param("path") path?: string, @QueryParam("is_sys_path", {required: false}) is_sys_path?: number): Promise<Result<GetFilePojo | string>> {
        // 默认已经对 url 解码了 这里不做也行
        return await FileServiceImpl.getFile(decodeURIComponent(path), ctx.headers.authorization, is_sys_path);
    }

    @msg(CmdType.file_info)
    async wsGetFileInfo(data: WsData<any>) {
        const pojo = data.context as {type: FileTypeEnum, path: string};
        return await FileServiceImpl.getFileInfo(pojo.type, pojo.path, (data.wss as Wss).token,(data.wss as Wss));
    }

    @Post('/file/info')
    async getFileInfo(@Req() ctx, @Body() data: { type: FileTypeEnum, path: string }) {
        return Sucess(await FileServiceImpl.getFileInfo(data.type, data.path, ctx.headers.authorization));
    }

    // @Put('/:path([^"]{0,})')
    // async uploadFile(@Req() ctx, @Param("path") path?: string, @UploadedFile('file', {options: FileServiceImpl.fileUploadOptions}) file?: any) {
    //     // await FileServiceImpl.uploadFile(path, file,ctx.headers.authorization);
    //     return Sucess("1");
    // }

    @Put('/:path([^"]{0,})')
    async uploadFile(@Req() req: Request, @Res() res: Response, @Param("path") path?: string) {
        userService.check_user_auth(req.headers.authorization,UserAuth.filecat_file_context_update_upload_created_copy_decompression);
        await FileServiceImpl.uploadFile(decodeURIComponent(path), req, res, req.headers.authorization);
        return Sucess("1");
    }

    @msg(CmdType.file_upload_pre)
    async file_upload_pre(data: WsData<ws_file_upload_req>) {
        return FileServiceImpl.file_upload_pre(data);
    }

    @msg(CmdType.file_upload)
    async file_upload(data: WsData<ws_file_upload_req>) {
        await FileServiceImpl.file_upload(data);
        return ""
    }


    @Delete('/:path([^"]{0,})')
    async deletes(@Req() ctx, @Param("path") path?: string) {
        userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_delete_cut_rename);
        return await FileServiceImpl.deletes(ctx.headers.authorization, path);
    }

    @Post('/save/:path([^"]{0,})') // 保存的是文本 最大50MB
    async save(@Req() ctx, @Param("path") path?: string, @Body({options:{limit: 6250000}}) data?: saveTxtReq, @QueryParam("is_sys_path", {required: false}) is_sys_path?: number) {
        if(userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_context_update,false) ||
            userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_context_update_upload_created_copy_decompression,false) ) {
            await FileServiceImpl.save(ctx.headers.authorization, data?.context, path, is_sys_path);
            return Sucess("1");
        }
        return Fail("no permission")
    }

    // base保存支持分片
    @Post('/base64/save/:path([^"]{0,})')
    async common_base64_save(@Req() ctx, @Param("path") path?: string, @Body({options:{limit: 6250000}}) data?: {
        base64_context: string,
        type: base64UploadType
    }) {
        path = decodeURIComponent(path);
        if(userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_context_update,false) ||
            userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_context_update_upload_created_copy_decompression,false) ) {
            await FileServiceImpl.common_base64_save(ctx.headers.authorization, path, data.base64_context, data.type);
            return Sucess("1");
        }
        return Fail("no permission")
    }

    // // 这里的路径不是相对的而是系统绝对路径
    // @Post('/common/save')
    // async common_save(@Body() data: {path:string,context:string}) {
    //     await FileServiceImpl.common_save(data.path,data.context);
    //     return Sucess("1");
    // }


    @Post('/cut')
    async cut(@Req() ctx, @Body() data?: cutCopyReq) {
        userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_delete_cut_rename);
        await FileServiceImpl.cut(ctx.headers.authorization, data);
        return Sucess("1");
    }

    @Post('/copy')
    async copy(@Req() ctx, @Body() data?: cutCopyReq) {
        userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_context_update_upload_created_copy_decompression);
        await FileServiceImpl.copy(ctx.headers.authorization, data);
        return Sucess("1");
    }

    @Post('/new/file')
    async newFile(@Req() ctx, @Body() data?: fileInfoReq) {
        userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_context_update_upload_created_copy_decompression);
        await FileServiceImpl.newFile(ctx.headers.authorization, data);
        return Sucess("1");
    }

    @Post('/new/dir')
    async newDir(@Req() ctx, @Body() data?: fileInfoReq) {
        userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_context_update_upload_created_copy_decompression);
        await FileServiceImpl.newDir(ctx.headers.authorization, data);
        return Sucess("1");
    }

    @Post('/rename')
    async rename(@Req() ctx, @Body() data?: fileInfoReq) {
        userService.check_user_auth(ctx.headers.authorization,UserAuth.filecat_file_delete_cut_rename);
        await FileServiceImpl.rename(ctx.headers.authorization, data);
        return Sucess("1");
    }

    // 切换路径
    @Post('/base_switch')
    async switchBasePath(@Body() data: { root_index: number }, @Req() ctx) {
        const user_data = userService.get_user_info_by_token(ctx.headers.authorization);
        user_data.folder_item_now = data.root_index;
        await userService.save_user_info(user_data.id,user_data);
        // const obj = Cache.getValue(ctx.headers.authorization);
        // if (obj) {
        //     obj["root_index"] = data.root_index;
        // }
        return Sucess("1");
    }

    // 获取主根位置
    @Post('/base_switch/get')
    async switchGetBasePath(@Req() req: Request) {
        // const obj = Cache.getValue(req.headers.authorization);
        // let index;
        // if (obj["root_index"] !== undefined) {
        //     index = obj["root_index"];
        // } else {
        //     const list = settingService.getFilesSetting();
        //     for (let i = 0; i < list.length; i++) {
        //         const item = list[i];
        //         if (item.default) {
        //             index = i;
        //         }
        //     }
        // }
        const user_data = userService.get_user_info_by_token(req.headers.authorization);
        return Sucess(user_data.folder_item_now === undefined ? 0 :user_data.folder_item_now);
    }

    @msg(CmdType.file_video_trans)
    async file_video_trans(data: WsData<FileVideoFormatTransPojo>) {
        FileServiceImpl.file_video_trans(data);
        return ""
    }

    @msg(CmdType.file_uncompress)
    async uncompress(data: WsData<FileCompressPojo>) {
        await FileServiceImpl.uncompress(data);
        return ""
    }

    @msg(CmdType.file_compress)
    async compress(data: WsData<FileCompressPojo>) {
        await FileServiceImpl.FileCompress(data);
        return ""
    }

    @msg(CmdType.log_viewer)
    async log_viewer(data: WsData<LogViewerPojo>) {
        // 如果一行太长 现在会进行截断成多个分裂的行
        return await FileServiceImpl.log_viewer(data);
    }

    @msg(CmdType.log_viewer_watch)
    async log_viewer_watch(data: WsData<LogViewerPojo>) {
        // 如果一行太长 现在会进行截断成多个分裂的行
        return FileServiceImpl.log_viewer_watch(data);
    }

    @msg(CmdType.search_file)
    async search_file(data: WsData<LogViewerPojo>) {
        search_file(data);
        return "";
    }

    @msg(CmdType.search_file_cancel)
    async search_file_cancel(data: WsData<LogViewerPojo>) {
        search_file_cancel(data);
        return "";
    }

    // 获取studio路径
    @Post("/studio/get/item")
    async studio_get_item(@Body() data: { path: string }, @Req() ctx) {
        return Sucess(await FileServiceImpl.studio_get_item(data.path, ctx.headers.authorization));
    }

    // 获取 workflow 的输入值
    @Post("/workflow/get/pre_inputs")
    async workflow_get_pre_inputs(@Body() data: { path: string }, @Req() ctx) {
        const sysPath = path.join(settingService.getFileRootPath(ctx.headers.authorization), data.path ? decodeURIComponent(data.path) : "");
        userService.check_user_path(ctx.headers.authorization, sysPath);
        return Sucess(await workflowService.workflow_get_pre_inputs(sysPath));
    }

    // workflow 执行
    @msg(CmdType.workflow_exec)
    async workflow_exec(data: WsData<WorkflowReq>) {
        userService.check_user_auth((data.wss as Wss).token, UserAuth.workflow_exe);
        await workflowService.workflow_exec(data);
        return "";
    }

    // worflow 查询
    @msg(CmdType.workflow_get)
    async workflow_get(data: WsData<WorkflowGetReq>) {
        return workflowService.workflow_get(data);
    }

    // 实时监听
    @msg(CmdType.workflow_realtime)
    async workflow_realtime(data: WsData<WorkFlowRealTimeReq>) {
        return workflowService.workflow_realtime(data);
    }

    @msg(CmdType.workflow_realtime_one_req)
    async workflow_realtime_one(data: WsData<WorkFlowRealTimeOneReq>) {
        return workflowService.workflow_realtime_one(data);
    }

    @msg(CmdType.workflow_search_by_run_name)
    async workflow_search_by_run_name(data: WsData<WorkFlowRealTimeOneReq>) {
        return workflowService.workflow_search_by_run_name(data);
    }

    // 统计文件大小
    @msg(CmdType.folder_size_info)
    async folder_size_info(data:WsData<any>) {
        await FileServiceImpl.get_folder_info(data.context.path,  (data.wss as Wss).token,(data.wss as Wss));
        return [0,0];
    }
    @msg(CmdType.folder_size_info_close)
    async folder_size_info_close(data:WsData<any>) {
        await FileServiceImpl.stop_folder_info(data.context.path,  (data.wss as Wss).token);
    }
}
