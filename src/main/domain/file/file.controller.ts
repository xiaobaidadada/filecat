// 定义一个控制器
import {
    Body,
    Controller,
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
import {GetFilePojo} from "../../../common/file.pojo";
import {FileServiceImpl} from "./file.service";
import {Result, Sucess} from "../../other/Result";
import multer from 'multer';
import {cutCopyReq, fileInfoReq, fileReq, saveTxtReq} from "../../../common/req/file.req";

@Controller("/file")
export class FileController {

    @Get()
    async getRootFile(): Promise<Result<GetFilePojo | string>> {
        return await FileServiceImpl.getFile('');
    }

    @Get('/:path*')
    async getFile(@Param("path") path?: string): Promise<Result<GetFilePojo | string>> {
        return await FileServiceImpl.getFile(path);
    }


    @Put("/:path*")
    async uploadFile(@Param("path") path?: string, @UploadedFile('file') file?: multer.File) {
        await FileServiceImpl.uploadFile(path, file);
        return Sucess("1");
    }

    @Delete("/:path*")
    async deletes(@Param("path") path?: string) {
        await FileServiceImpl.deletes(path);
        return Sucess("1");
    }

    @Post('/save/:path*')
    async save(@Param("path") path?: string, @Body() data?: saveTxtReq) {
        await FileServiceImpl.save(data?.context, path);
        return Sucess("1");
    }

    @Post('/cut')
    async cut(@Body() data?: cutCopyReq) {
        await FileServiceImpl.cut(data);
        return Sucess("1");
    }

    @Post('/copy')
    async copy(@Body() data?: cutCopyReq) {
        await FileServiceImpl.copy(data);
        return Sucess("1");
    }

    @Post('/new/file')
    async newFile(@Body() data?: fileInfoReq) {
        await FileServiceImpl.newFile(data);
        return Sucess("1");
    }

    @Post('/new/dir')
    async newDir(@Body() data?: fileInfoReq) {
        await FileServiceImpl.newDir(data);
        return Sucess("1");
    }

    @Post('/rename')
    async rename(@Body() data?: fileInfoReq) {
        await FileServiceImpl.rename(data);
        return Sucess("1");
    }

}
