// 定义一个控制器
import {
    Body,
    Controller, Ctx,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put, QueryParam,
    Res,
    UploadedFile,
    UseBefore
} from "routing-controllers";
import {FileCompressPojo, FileVideoFormatTransPojo, GetFilePojo} from "../../../common/file.pojo";
import {FileServiceImpl} from "./file.service";
import {Result, Sucess} from "../../other/Result";
import multer from 'multer';
import {cutCopyReq, fileInfoReq, fileReq, saveTxtReq} from "../../../common/req/file.req";
import {Cache} from "../../other/cache";
import {msg} from "../../../common/frame/router";
import {CmdType, WsData} from "../../../common/frame/WsData";

@Controller("/file")
export class FileController {

    @Get()
    async getRootFile(@Ctx() ctx): Promise<Result<GetFilePojo | string>> {
        return await FileServiceImpl.getFile('',ctx.headers.authorization);
    }

    @Get('/:path*')
    async getFile(@Ctx() ctx,@Param("path") path?: string): Promise<Result<GetFilePojo | string>> {
        return await FileServiceImpl.getFile(path,ctx.headers.authorization);
    }


    @Put("/:path*")
    async uploadFile(@Ctx() ctx,@Param("path") path?: string, @UploadedFile('file') file?: multer.File) {
        await FileServiceImpl.uploadFile(path, file,ctx.headers.authorization);
        return Sucess("1");
    }

    @Delete("/:path*")
    async deletes(@Ctx() ctx,@Param("path") path?: string) {
        await FileServiceImpl.deletes(ctx.headers.authorization,path);
        return Sucess("1");
    }

    @Post('/save/:path*')
    async save(@Ctx() ctx,@Param("path") path?: string, @Body() data?: saveTxtReq) {
        await FileServiceImpl.save(ctx.headers.authorization,data?.context, path);
        return Sucess("1");
    }

    @Post('/cut')
    async cut(@Ctx() ctx,@Body() data?: cutCopyReq) {
        await FileServiceImpl.cut(ctx.headers.authorization,data);
        return Sucess("1");
    }

    @Post('/copy')
    async copy(@Ctx() ctx,@Body() data?: cutCopyReq) {
        await FileServiceImpl.copy(ctx.headers.authorization,data);
        return Sucess("1");
    }

    @Post('/new/file')
    async newFile(@Ctx() ctx,@Body() data?: fileInfoReq) {
        await FileServiceImpl.newFile(ctx.headers.authorization,data);
        return Sucess("1");
    }

    @Post('/new/dir')
    async newDir(@Ctx() ctx ,@Body() data?: fileInfoReq) {
        await FileServiceImpl.newDir(ctx.headers.authorization,data);
        return Sucess("1");
    }

    @Post('/rename')
    async rename(@Ctx() ctx ,@Body() data?: fileInfoReq) {
        await FileServiceImpl.rename(ctx.headers.authorization,data);
        return Sucess("1");
    }

    @Post('/base_switch')
    async switchBasePath(@Body() data:{root_index:number},@Ctx() ctx ) {
        const obj = Cache.getTokenMap().get(ctx.headers.authorization);
        if (obj) {
            obj["root_index"] = data.root_index;
        }
        return Sucess("1");
    }

    @Post('/base_switch/get')
    async switchGetBasePath(@Ctx() ctx ) {
        const obj = Cache.getTokenMap().get(ctx.headers.authorization);
        return Sucess(obj?obj["root_index"]??0:null);
    }

    @msg(CmdType.file_video_trans)
    async file_video_trans(data:WsData<FileVideoFormatTransPojo>) {
        FileServiceImpl.file_video_trans(data);
        return ""
    }

    @msg(CmdType.file_uncompress)
    async uncompress(data:WsData<FileCompressPojo>) {
        FileServiceImpl.uncompress(data);
        return ""
    }

    @msg(CmdType.file_compress)
    async compress(data:WsData<FileCompressPojo>) {
        FileServiceImpl.FileCompress(data);
        return ""
    }

}
