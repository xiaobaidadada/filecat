import { FileTypeEnum, GetFilePojo} from "../../../common/file.pojo";
// import {config} from "../../other/config";
import fs, {Stats} from "fs";
import fse from 'fs-extra'
import path from "path";
import {Fail, Result, Sucess} from "../../other/Result";
import multer from "multer";
import {rimraf} from "rimraf";
import {cutCopyReq, fileInfoReq} from "../../../common/req/file.req";
import {formatFileSize, getShortTime} from "../../../common/ValueUtil";
import * as Stream from "node:stream";
import {Env} from "../../../common/Env";
import {settingService} from "../setting/setting.service";
const archiver = require('archiver');

const MAX_SIZE_TXT = 20 * 1024 * 1024;
class FileService {

    public async getFile(filePath,token):Promise<Result<GetFilePojo|string>> {
        const result:GetFilePojo = {
            files:[],
            folders:[]
        };
        const sysPath = path.join(settingService.getFileRootPath(token),filePath?decodeURIComponent(filePath):"");
        const stats = fs.statSync(sysPath);
        if (stats.isFile()) {
            // 单个文件
            if (stats.size > MAX_SIZE_TXT) {
                return Fail("超过20MB");
            }
            const buffer = fs.readFileSync(sysPath);
            return Sucess(buffer.toString());
        }

        const items = fs.readdirSync(sysPath);// 读取目录内容
        for (const item of items) {
            const filePath = path.join(sysPath, item);
            // 获取文件或文件夹的元信息
            let stats: null| Stats= null;
            try {
                stats = fs.statSync(filePath);
            } catch (e) {
                continue;
            }
            const formattedCreationTime = getShortTime(new Date(stats.mtime).getTime());
            const size = formatFileSize(stats.size);
            if (stats.isFile()) {
                result.files?.push({
                    type:FileTypeEnum.text,
                    name:item,
                    mtime:formattedCreationTime,
                    size
                })
            } else if (stats.isDirectory()) {
                result.folders?.push({
                    type:FileTypeEnum.folder,
                    name:item,
                    mtime:formattedCreationTime,
                })
            }
        }
        return Sucess(result);
    }


    public uploadFile(filePath,file: multer.File,token) {
        const sysPath = path.join(settingService.getFileRootPath(token),filePath?decodeURIComponent(filePath):"");
        if (!file) {
            // 目录
            if (!fs.existsSync(sysPath)) {
                // 目录不存在，创建目录
                fs.mkdirSync(sysPath, { recursive: true });
            }
            return;
        }
        // 写入文件
        fs.writeFileSync(sysPath, file.buffer);
    }

    public deletes(token,filePath?:string) {
        if (!filePath) {
            return;
        }
        const sysPath = path.join(settingService.getFileRootPath(token),decodeURIComponent(filePath));
        const stats = fs.statSync(sysPath);
        if (stats.isFile()) {
            fs.unlinkSync(sysPath)
        } else {
            rimraf(sysPath);
        }
    }

    public save(token,context?:string,filePath?:string) {
        if (context===null || context===undefined) {
            return;
        }
        const sysPath = path.join(settingService.getFileRootPath(token),filePath?decodeURIComponent(filePath):"");
        // 写入文件
        fs.writeFileSync(sysPath, context);
    }

    public cut(token,data?: cutCopyReq) {
        if (!data) {
            return;
        }
        const root_path = settingService.getFileRootPath(token);
        const sysPath = path.join(root_path);
        const toSysPath = path.join(root_path,data.to?decodeURIComponent(data.to):"");
        for (const file of data.files) {
            const filePath = decodeURIComponent(path.join(sysPath, file));
            fs.renameSync(filePath,decodeURIComponent(path.join(toSysPath,path.basename(file))));
            rimraf(filePath);
        }
    }

    public async copy(token,data?: cutCopyReq) {
        if (!data) {
            return;
        }
        const root_path = settingService.getFileRootPath(token);
        const sysPath = path.join(root_path);
        const toSysPath = path.join(root_path,data.to?decodeURIComponent(data.to):"");
        for (const file of data.files) {
            const filePath = decodeURIComponent(path.join(sysPath, file));
            // 覆盖
            await fse.copy(filePath,decodeURIComponent(path.join(toSysPath,path.basename(file))),{overwrite: true});
        }


    }

    public async newFile(index,data?: fileInfoReq) {
        await this.todoNew(index,2,data)

    }

    public async newDir(index,data?: fileInfoReq) {
        await this.todoNew(index,1,data)
    }

    public async todoNew(index,type,data?: fileInfoReq) {
        if (data===null || data===undefined) {
            return
        }
        const sysPath = path.join(settingService.getFileRootPath(index),decodeURIComponent(data.name));
        if (fs.existsSync(sysPath)) {
            return;
        }
        if (type===1) {
            // 创建目录
            fs.mkdirSync(sysPath, { recursive: true });
        } else {
            fs.writeFileSync(sysPath,"");

        }
    }

    public async rename(token,data?: fileInfoReq) {
        if (!data) {
            return;
        }
        const root_path = settingService.getFileRootPath(token);
        const sysPath = path.join(root_path,decodeURIComponent(data.name));
        const sysPathNew = path.join(root_path,decodeURIComponent(data.newName));
        await fse.rename(sysPath,sysPathNew);
    }


    download(ctx) {
        const file = ctx.request.query.file;
        if (!file || !file.length) {
            ctx.status = 404;
            ctx.body = 'File not found';
            return;
        }
        const token = ctx.query['token'];
        if (!Array.isArray(file)) {
            ctx.set('Content-Type', 'application/octet-stream');
            const sysPath = path.join(settingService.getFileRootPath(token),decodeURIComponent(file));
            const fileName = path.basename(sysPath)
            const stats = fs.statSync(sysPath);
            if (stats.isFile()) {
                ctx.attachment(fileName); // 设置文件名
                // 发送文件
                ctx.body = fs.createReadStream(sysPath);
            } else {
                ctx.attachment(fileName+".zip");
                const archive = archiver('zip', {
                    zlib: { level: 5 } // 设置压缩级别
                });
                const stream = new Stream.PassThrough()
                ctx.body = stream
                // 将压缩后的文件流发送给客户端
                archive.pipe(stream);
                archive.directory(sysPath);
                archive.finalize();
            }

        } else {
            const files:string [] = file;
            const archive = archiver('zip', {
                zlib: { level: 5 } // 设置压缩级别
            });
            ctx.attachment("output.zip");
            ctx.set('Content-Type', 'application/octet-stream');
            // ctx.set('Content-Type', 'application/zip');
            // ctx.set('Content-Disposition', 'attachment; filename=output.zip');
            const stream = new Stream.PassThrough()
            ctx.body = stream
            // 将压缩后的文件流发送给客户端
            archive.pipe(stream)
            for (const file of files) {
                const sysPath = path.join(settingService.getFileRootPath(token),decodeURIComponent(file));
                const stats = fs.statSync(sysPath);
                if (stats.isFile()) {
                    archive.file(sysPath);
                } else {
                    archive.directory(sysPath);
                }
            }
            archive.finalize();
        }
    }

}

export const FileServiceImpl = new FileService();
