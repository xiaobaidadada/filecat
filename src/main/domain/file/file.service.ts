import {
    FileCompressPojo,
    FileCompressType, FileTreeList,
    FileTypeEnum,
    FileVideoFormatTransPojo,
    GetFilePojo
} from "../../../common/file.pojo";
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
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {SysPojo} from "../../../common/req/sys.pojo";
import {RCode} from "../../../common/Result.pojo";
import {FileCompress} from "./file.compress";
import {getFfmpeg} from "../bin/bin";
import {getFileFormat} from "../../../common/FileMenuType";
import {getEditModelType} from "../../../common/StringUtil";
const archiver = require('archiver');
const mime = require('mime-types');


const MAX_SIZE_TXT = 20 * 1024 * 1024;
class FileService extends FileCompress{

    public async getFile(param_path,token):Promise<Result<GetFilePojo|string>> {
        const result:GetFilePojo = {
            files:[],
            folders:[]
        };
        const sysPath = path.join(settingService.getFileRootPath(token),param_path?decodeURIComponent(param_path):"");
        if (!fs.existsSync(sysPath)) {
            return Fail("路径不存在",RCode.Fail);
        }
        const stats = fs.statSync(sysPath);
        if (stats.isFile()) {
            // 单个文件
            if (stats.size > MAX_SIZE_TXT) {
                return Fail("超过20MB",RCode.File_Max);
            }
            const name = path.basename(sysPath);
            const buffer = fs.readFileSync(sysPath);
            const pojo = Sucess(buffer.toString(),RCode.PreFile);
            pojo.message = name;
            return pojo;
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
                const type = getFileFormat(item);
                result.files?.push({
                    type:type,
                    name:item,
                    mtime:formattedCreationTime,
                    size,
                    isLink:stats.isSymbolicLink(),
                    path:`${param_path}/${item}`
                })
            } else if (stats.isDirectory()) {
                result.folders?.push({
                    type:FileTypeEnum.folder,
                    name:item,
                    mtime:formattedCreationTime,
                    isLink:stats.isSymbolicLink(),
                    path:param_path
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

    public common_save(path:string,context:string) {
        fs.writeFileSync(path, context);
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


    async download(ctx) {
        const file = ctx.request.query.file;
        if (!file || !file.length) {
            ctx.status = 404;
            ctx.body = 'File not found';
            return;
        }
        const token = ctx.query['token'];
        if (!await settingService.check(token)) {
            ctx.status = 404;
            ctx.body = 'File not found';
            return;
        }
        if (!Array.isArray(file)) {

            const sysPath = path.join(settingService.getFileRootPath(token),decodeURIComponent(file));
            const fileName = path.basename(sysPath)
            const stats = fs.statSync(sysPath);
            ctx.set('Content-Type', mime.lookup(fileName) || 'application/octet-stream');
            if (!fileName.endsWith('.pdf')) {
                ctx.attachment(fileName); // 设置文件名
            }
            if (stats.isFile()) {
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
                archive.directory(sysPath,path.basename(sysPath));
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

    file_video_trans(data:WsData<FileVideoFormatTransPojo>) {
        const pojo = data.context as FileVideoFormatTransPojo;
        const wss = data.wss as Wss;
        const root_path = settingService.getFileRootPath(pojo.token);
        const sysPath = path.join(root_path,decodeURIComponent(pojo.source_filename));
        const sysPathNew = path.join(root_path,decodeURIComponent(pojo.to_filename));

        getFfmpeg()(sysPath)
            .toFormat(pojo.to_format)
            // .videoCodec('libx264')
            // .audioCodec('aac')
            .on('start', function(commandLine) {
                const result = new WsData<SysPojo>(CmdType.file_video_trans_progress);
                result.context = 0;
                wss.sendData(result.encode());
            })
            .on('progress', function(progress) {
                const result = new WsData<SysPojo>(CmdType.file_video_trans_progress);
                result.context = progress.percent.toFixed(0);
                wss.sendData(result.encode());
            })
            .on('error', function(err, stdout, stderr) {
                wss.ws.close();
            })
            .on('end', function() {
                const result = new WsData<SysPojo>(CmdType.file_video_trans_progress);
                result.context = 100;
                wss.sendData(result.encode());
            })
            .save(sysPathNew);
    }

    async uncompress(data:WsData<FileCompressPojo>) {
        const pojo = data.context as FileCompressPojo;
        const source_file = decodeURIComponent(pojo.source_file);
        const tar_dir = decodeURIComponent(pojo.tar_dir??"");
        const directoryPath = path.dirname(source_file);
        const root_path = settingService.getFileRootPath(pojo.token);
        const targetFolder = path.join(root_path,directoryPath,tar_dir);
        const wss = data.wss as Wss;
        if(tar_dir) {
            fs.mkdirSync(path.join(targetFolder), { recursive: true });
        }
        const sysSourcePath = path.join(root_path,source_file);
        const outHanle = (value)=>{
            if (value === -1) {
                wss.ws.close();
                return;
            }
            const result = new WsData<SysPojo>(CmdType.file_uncompress_progress);
            result.context = value;
            wss.sendData(result.encode());
        };
        if (pojo.format === FileCompressType.tar) {
            this.unTar(sysSourcePath,targetFolder,outHanle)
        } else if (pojo.format === FileCompressType.zip) {
            this.unZip(sysSourcePath,targetFolder,outHanle)
        }  else if (pojo.format === FileCompressType.gzip) {
            this.unTar(sysSourcePath,targetFolder,outHanle,true)
        } else if (pojo.format === FileCompressType.rar) {
            try {
                await this.unRar(sysSourcePath,targetFolder,outHanle)
            } catch (e) {
                wss.ws.close();
            }
        } else {
            wss.ws.close();
        }
    }

    FileCompress(data:WsData<FileCompressPojo>) {
        const pojo = data.context as FileCompressPojo;
        const files = pojo.filePaths;
        const root_path = settingService.getFileRootPath(pojo.token);
        const wss = data.wss as Wss;
        const filePaths:string[] = [],directorys:string[]= [];
        for (const file of files) {
            const name  = path.join(root_path,decodeURIComponent(file));
            try {
                const stats = fs.statSync(name);
                if (stats.isFile()) {
                    filePaths.push(name);
                } else {
                    directorys.push(name);
                }
            } catch (e) {
            }
        }
        let format;
        switch (pojo.format) {
            case FileCompressType.gzip:
                format = FileCompressType.tar;
                break;
            default:
                format = pojo.format;
        }
        const targerFilePath  = path.join(root_path,decodeURIComponent(pojo.tar_filename));
        this.compress(format,pojo.compress_level,targerFilePath,filePaths,directorys,(value)=>{
            if (value === -1) {
                wss.ws.close();
                return;
            }
            const result = new WsData<SysPojo>(CmdType.file_compress_progress);
            result.context = value;
            wss.sendData(result.encode());
        },pojo.format === FileCompressType.gzip);
    }

    getTotalFile(data:{files:string[],total:number},filepath:string) {
        try {
            const stats = fs.statSync(filepath);
            if (stats.isFile()) {
                data.total += 1;
                data.files.push(filepath);
                return;
            }
        } catch (e) {
            return
        }
        const items = fs.readdirSync(filepath);// 读取目录内容
        for (const item of items) {
            const p = path.join(filepath, item);
            this.getTotalFile(data,p);
        }
    }

    async studio_get_item(param_path:string,token:string) {
        const result:{list:FileTreeList} = {
            list:[]
        };
        const sysPath = path.join(settingService.getFileRootPath(token),param_path?decodeURIComponent(param_path):"");
        if (!fs.existsSync(sysPath)) {
            return Fail("路径不存在",RCode.Fail);
        }
        const stats = fs.statSync(sysPath);
        if (stats.isFile()) {
            return Fail("是文件",RCode.Fail);
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
            result.list.push({
                type:stats.isFile()?"file":"folder",
                name:item
            })
        }
        return result;
    }
}

export const FileServiceImpl = new FileService();
