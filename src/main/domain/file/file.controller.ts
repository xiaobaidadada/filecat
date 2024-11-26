// 定义一个控制器
import {
    Body,
    Controller, Ctx,
    Delete,
    Get, JsonController,
    Param,
    Patch,
    Post,
    Put, QueryParam, Req,
    Res,
    UploadedFile,
    UseBefore
} from "routing-controllers";
import {
    base64UploadType,
    FileCompressPojo,
    FileTypeEnum,
    FileVideoFormatTransPojo,
    GetFilePojo
} from "../../../common/file.pojo";
import {FileServiceImpl} from "./file.service";
import {Result, Sucess} from "../../other/Result";
import {cutCopyReq, fileInfoReq, fileReq, saveTxtReq} from "../../../common/req/file.req";
import {Cache} from "../../other/cache";
import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {settingService} from "../setting/setting.service";
import {Request, Response} from 'express';


@JsonController("/file")
export class FileController {


    @Get()
    async getRootFile(@Req() ctx): Promise<Result<GetFilePojo | string>> {
        return await FileServiceImpl.getFile('', ctx.headers.authorization);
    }

    @Get('/:path([^"]{0,})')
    async getFile(@Req() ctx, @Param("path") path?: string, @QueryParam("is_sys_path", {required: false}) is_sys_path?: number): Promise<Result<GetFilePojo | string>> {
        return await FileServiceImpl.getFile(path, ctx.headers.authorization, is_sys_path);
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
        await FileServiceImpl.uploadFile(path, req, res, req.headers.authorization);
        return Sucess("1");
    }


    @Delete('/:path([^"]{0,})')
    async deletes(@Req() ctx, @Param("path") path?: string) {
        return await FileServiceImpl.deletes(ctx.headers.authorization, path);
    }

    @Post('/save/:path([^"]{0,})')
    async save(@Req() ctx, @Param("path") path?: string, @Body() data?: saveTxtReq, @QueryParam("is_sys_path", {required: false}) is_sys_path?: number) {
        await FileServiceImpl.save(ctx.headers.authorization, data?.context, path, is_sys_path);
        return Sucess("1");
    }

    // base保存支持分片 这个框架post默认最大只支持1mb
    @Post('/base64/save/:path([^"]{0,})')
    async common_base64_save(@Req() ctx, @Param("path") path?: string, @Body() data?: {
        base64_context: string,
        type: base64UploadType
    }) {
        await FileServiceImpl.common_base64_save(ctx.headers.authorization, path, data.base64_context, data.type);
        return Sucess("1");
    }

    // // 这里的路径不是相对的而是系统绝对路径
    // @Post('/common/save')
    // async common_save(@Body() data: {path:string,context:string}) {
    //     await FileServiceImpl.common_save(data.path,data.context);
    //     return Sucess("1");
    // }


    @Post('/cut')
    async cut(@Req() ctx, @Body() data?: cutCopyReq) {
        await FileServiceImpl.cut(ctx.headers.authorization, data);
        return Sucess("1");
    }

    @Post('/copy')
    async copy(@Req() ctx, @Body() data?: cutCopyReq) {
        await FileServiceImpl.copy(ctx.headers.authorization, data);
        return Sucess("1");
    }

    @Post('/new/file')
    async newFile(@Req() ctx, @Body() data?: fileInfoReq) {
        await FileServiceImpl.newFile(ctx.headers.authorization, data);
        return Sucess("1");
    }

    @Post('/new/dir')
    async newDir(@Req() ctx, @Body() data?: fileInfoReq) {
        await FileServiceImpl.newDir(ctx.headers.authorization, data);
        return Sucess("1");
    }

    @Post('/rename')
    async rename(@Req() ctx, @Body() data?: fileInfoReq) {
        await FileServiceImpl.rename(ctx.headers.authorization, data);
        return Sucess("1");
    }

    // 切换路径
    @Post('/base_switch')
    async switchBasePath(@Body() data: { root_index: number }, @Req() ctx) {
        const obj = Cache.getTokenMap().get(ctx.headers.authorization);
        if (obj) {
            obj["root_index"] = data.root_index;
        }
        return Sucess("1");
    }

    // 获取主根位置
    @Post('/base_switch/get')
    async switchGetBasePath(@Req() req: Request) {
        const obj = Cache.getTokenMap().get(req.headers.authorization);
        let index;
        if (obj["root_index"] !== undefined) {
            index = obj["root_index"];
        } else {
            const list = settingService.getFilesSetting();
            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                if (item.default) {
                    index = i;
                }
            }
        }
        return Sucess(index);
    }

    @msg(CmdType.file_video_trans)
    async file_video_trans(data: WsData<FileVideoFormatTransPojo>) {
        FileServiceImpl.file_video_trans(data);
        return ""
    }

    @msg(CmdType.file_uncompress)
    async uncompress(data: WsData<FileCompressPojo>) {
        FileServiceImpl.uncompress(data);
        return ""
    }

    @msg(CmdType.file_compress)
    async compress(data: WsData<FileCompressPojo>) {
        FileServiceImpl.FileCompress(data);
        return ""
    }

    // 获取studio路径
    @Post("/studio/get/item")
    async studio_get_item(@Body() data: { path: string }, @Req() ctx) {
        return Sucess(await FileServiceImpl.studio_get_item(data.path, ctx.headers.authorization));
    }

}
