import {
    base64UploadType,
    FileCompressPojo,
    FileCompressType, FileTreeList,
    FileTypeEnum,
    FileVideoFormatTransPojo, FileInfoItemData,
    GetFilePojo, LogViewerPojo
} from "../../../common/file.pojo";
// import {config} from "../../other/config";
import fs, {Stats} from "fs";
import fse from 'fs-extra'
import path from "path";
import {Fail, Result, Sucess} from "../../other/Result";
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
import {getEditModelType, removeTrailingPath} from "../../../common/StringUtil";
import si from "systeminformation";

const archiver = require('archiver');
const mime = require('mime-types');
import multer from 'multer';
import {Request, Response} from "express";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";

const chokidar = require('chokidar');

class FileService extends FileCompress {

    public async getFile(param_path, token, is_sys_path?: number): Promise<Result<GetFilePojo | string>> {
        const result: GetFilePojo = {
            files: [],
            folders: [],
            relative_user_path:undefined
        };
        if (is_sys_path === 1 && decodeURIComponent(param_path) === "/etc/fstab") {
            userService.check_user_auth(token, UserAuth.sys_disk_mount);
        }
        const root_path = settingService.getFileRootPath(token);
        const sysPath = is_sys_path === 1 ? `${decodeURIComponent(param_path)}` : path.join(root_path, param_path ? decodeURIComponent(param_path) : "");
        userService.check_user_path(token, sysPath)
        if (!fs.existsSync(sysPath)) {
            return Fail("路径不存在", RCode.Fail);
        }
        const stats = fs.statSync(sysPath);
        if (stats.isFile()) {
            // 单个文件
            // if (stats.size > MAX_SIZE_TXT) {
            //     return Fail("超过20MB", RCode.File_Max);
            // }
            const name = path.basename(sysPath);
            const buffer = fs.readFileSync(sysPath);
            const pojo = Sucess(buffer.toString(), RCode.PreFile);
            pojo.message = name;
            return pojo;
        } else {
            if (!stats.isDirectory()) {
                return Fail("不是文件", RCode.Fail);
            }
        }

        if(is_sys_path === 1) {
            if (sysPath.startsWith(root_path)) {
                result.relative_user_path = sysPath.substring(root_path.length);
            }
            return Sucess(result); // 只返回相对路径
        }
        const items = fs.readdirSync(sysPath);// 读取目录内容
        for (const item of items) {
            const filePath = path.join(sysPath, item);
            // 获取文件或文件夹的元信息
            let stats: null | Stats = null;
            try {
                stats = fs.statSync(filePath);
            } catch (e) {
                console.log("读取错误", e);
            }
            const formattedCreationTime = stats ? getShortTime(new Date(stats.mtime).getTime()) : "";
            // const size = stats ? formatFileSize(stats.size) : "";
            if (stats && stats.isFile()) {
                const type = getFileFormat(item);
                result.files?.push({
                    type: type,
                    name: item,
                    mtime: formattedCreationTime,
                    size: stats.size,
                    isLink: stats?.isSymbolicLink(),
                    path: path.join(param_path, item)
                })
            } else if (stats && stats.isDirectory()) {
                result.folders?.push({
                    type: FileTypeEnum.folder,
                    name: item,
                    mtime: formattedCreationTime,
                    isLink: stats?.isSymbolicLink(),
                    path: param_path
                })
            } else {
                result.files?.push({
                    type: FileTypeEnum.dev,
                    name: item,
                    mtime: formattedCreationTime,
                    size: stats?.size,
                    path: path.join(param_path, item)
                })
            }
        }
        return Sucess(result);
    }

    public async getFileInfo(type: FileTypeEnum, fpath: string, token,wss?:Wss) {
        let info: FileInfoItemData = {};
        const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(fpath));
        userService.check_user_path(token, sysPath)
        switch (type) {
            case FileTypeEnum.folder:
                if(wss) {
                    this.getDiskSizeForPath(sysPath).then(data=>{
                        const result = new WsData<SysPojo>(CmdType.file_info);
                        result.context = data;
                        wss.sendData(result.encode())
                    }).catch(error=>{
                        console.log(error);
                    })
                } else {
                    info = await this.getDiskSizeForPath(sysPath);
                }
                break;
            default:
                break;
        }
        info.now_absolute_path = sysPath;
        return info;
    }


    fileUploadOptions = {
        storage: multer.diskStorage({
            destination: (req: any, file: any, cb: any) => {
                // return cb(new Error("Custom error: Path issue"));
                cb(null, req.fileDir);  // 存储路径
            },
            filename: (req: any, file: any, cb: any) => {
                // file.originalname
                cb(null, req.fileName);
            }
        })
    };

    // 上传文件 必须 保证文件所在的文件夹已经存在了
    upload = multer({
        storage: this.fileUploadOptions.storage,
        // limits: { fileSize: 1024 * 1024 * 2 }, // 限制文件大小为 2MB 无限制
    }).single('file');

    public uploadFile(filePath, req: Request, res: Response, token) {

        const sysPath = path.join(settingService.getFileRootPath(token), filePath ? decodeURIComponent(filePath) : "");
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);
        // if (!file) {
        //     // 目录
        if ((req.query.dir === "1") && !fs.existsSync(sysPath)) {
            // 目录不存在，创建目录
            fs.mkdirSync(sysPath, {recursive: true});
            return;
        }
        //     return;
        // }
        req['fileDir'] = path.dirname(sysPath);
        req['fileName'] = path.basename(sysPath);
        this.upload(req, res, (err) => {
            if (err) {

            }
            // 成功上传
        });
        // 写入文件
        // fs.writeFileSync(sysPath, file.buffer);
        //multer 默认使用 return new Multer({}) 默认memoryStorage 这种方式 buffer 不属于v8内存管理  所以内存释放的比较慢
    }

    public deletes(token, filePath?: string) {
        if (!filePath) {
            return Sucess("1");
        }
        let sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(filePath));
        userService.check_user_path(token, sysPath)
        if (userService.protectionCheck(sysPath, token) || settingService.protectionCheck(sysPath)) {
            return Fail("1", RCode.PROTECT_FILE);
        }
        // 回收站判断
        if (settingService.get_recycle_bin_status()) {
            sysPath = removeTrailingPath(sysPath);
            const cyc_map_list = settingService.get_recycle_dir_map_list();
            for (const it of cyc_map_list) {
                let cyc_p;
                let check_cyc_p = "";
                if (it.length > 1 && !!it[1]) {
                    cyc_p = removeTrailingPath(it[1]);
                    check_cyc_p = it[0];
                } else {
                    cyc_p = removeTrailingPath(it[0]); // 没有设置预先被删除目录
                }
                if (cyc_p === sysPath) {
                    throw "cyc dir not to del"; // 回收站不能被删除
                }
                if (check_cyc_p !== "" && !userService.isSubPath(check_cyc_p, sysPath)) {
                    continue; // 不属于这个回收站目录
                }
                if (userService.isSubPath(cyc_p, sysPath)) {
                    continue; // 是回收站内的文件
                }
                // 开始回收
                const ext_name = path.extname(sysPath);
                const fileName = path.basename(filePath, ext_name);
                let p = path.join(cyc_p, `${fileName}${ext_name}`);
                if (fs.existsSync(p)) {
                    p = path.join(cyc_p, `${fileName}_${Date.now()}${ext_name}`);
                    if (fs.existsSync(p)) {
                        throw "try again";
                    }
                }
                this.cut_exec(sysPath, p);
                return Sucess("1");
            }
            // 如果不是回收站内的文件 不做真的删除 而是剪切

            // let cyc_path = settingService.get_recycle_dir_str();
            // cyc_path = removeTrailingPath(cyc_path);
            // if(cyc_path === sysPath) {
            //     throw "cyc dir not to del"; // 回收站不能被删除
            // }
            // if(!userService.isSubPath(cyc_path,sysPath) && !!cyc_path) {
            //     // 如果不是回收站内的文件 不做真的删除 而是剪切 且回收站路径存在
            //     const ext_name = path.extname(sysPath);
            //     const fileName = path.basename(filePath, ext_name);
            //     let p = path.join(cyc_path,`${fileName}${ext_name}`);
            //     if(fs.existsSync(p)) {
            //         p = path.join(cyc_path,`${fileName}_${Date.now()}${ext_name}`);
            //         if(fs.existsSync(p)) {
            //             throw "try again";
            //         }
            //     }
            //     this.cut_exec(sysPath,p);
            //     return Sucess("1");
            // }
        }
        // 真的删除
        const stats = fs.statSync(sysPath);
        if (stats.isFile()) {
            fs.unlinkSync(sysPath)
        } else {
            rimraf(sysPath);
        }
        return Sucess("1");
    }

    public save(token, context?: string, filePath?: string, is_sys_path?: number) {
        if (context === null || context === undefined) {
            return;
        }
        const sysPath = is_sys_path === 1 ? `/${filePath}` : path.join(settingService.getFileRootPath(token), filePath ? decodeURIComponent(filePath) : "");
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);
        // const sysPath = path.join(settingService.getFileRootPath(token),filePath?decodeURIComponent(filePath):"");
        // 写入文件
        fs.writeFileSync(sysPath, context);
    }

    // public common_save(path:string,context:string) {
    //     fs.writeFileSync(path, context);
    // }

    public common_base64_save(token: string, filepath: string, base64_context: string, type: base64UploadType) {
        const sysPath = path.join(settingService.getFileRootPath(token), filepath);
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);
        const binaryData = Buffer.from(base64_context, 'base64');
        if (type === base64UploadType.all || type === base64UploadType.start) {
            fs.writeFileSync(sysPath, binaryData);
        } else if (type === base64UploadType.part) {
            fs.appendFileSync(sysPath, binaryData);
        }
    }

    public cut(token, data?: cutCopyReq) {
        if (!data) {
            return;
        }
        const root_path = settingService.getFileRootPath(token);
        const sysPath = path.join(root_path);
        const toSysPath = path.join(root_path, data.to ? decodeURIComponent(data.to) : "");
        userService.check_user_path(token, sysPath)
        userService.check_user_path(token, toSysPath)
        for (const file of data.files) {
            this.cut_exec(decodeURIComponent(path.join(sysPath, file)), decodeURIComponent(path.join(toSysPath, path.basename(file))))
        }
    }

    public cut_exec(source_path: string, to_file: string) {
        fs.renameSync(source_path, to_file);
        rimraf(source_path);
    }

    public async copy(token, data?: cutCopyReq) {
        if (!data) {
            return;
        }
        const root_path = settingService.getFileRootPath(token);
        const sysPath = path.join(root_path);
        const toSysPath = path.join(root_path, data.to ? decodeURIComponent(data.to) : "");
        userService.check_user_path(token, sysPath)
        userService.check_user_only_path(token, sysPath);
        userService.check_user_path(token, toSysPath)
        userService.check_user_only_path(token, toSysPath);
        for (const file of data.files) {
            const filePath = decodeURIComponent(path.join(sysPath, file));
            // 覆盖
            await fse.copy(filePath, decodeURIComponent(path.join(toSysPath, path.basename(file))), {overwrite: true});
        }


    }

    public async newFile(token, data?: fileInfoReq) {
        await this.todoNew(token, 2, data)

    }

    public async newDir(token, data?: fileInfoReq) {
        await this.todoNew(token, 1, data)
    }

    public async todoNew(token, type, data?: fileInfoReq) {
        if (data === null || data === undefined) {
            return
        }
        const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(data.name));
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);
        if (fs.existsSync(sysPath)) {
            return;
        }
        if (type === 1) {
            // 创建目录
            fs.mkdirSync(sysPath, {recursive: true});
        } else {
            fs.writeFileSync(sysPath, data.context ?? "");
        }
    }

    public async rename(token, data?: fileInfoReq) {
        if (!data) {
            return;
        }
        const root_path = settingService.getFileRootPath(token);
        const sysPath = path.join(root_path, decodeURIComponent(data.name));
        userService.check_user_path(token, sysPath)
        const sysPathNew = path.join(root_path, decodeURIComponent(data.newName));
        await fse.rename(sysPath, sysPathNew);
    }


    async download(ctx) {
        const file = ctx.query.file;
        if (!file || !file.length) {
            ctx.res.status(404).send('File not found');
            return;
        }
        const token = ctx.query['token'];
        if (!Array.isArray(file)) {
            // 单个文件
            const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(file));
            const fileName = path.basename(sysPath)
            const stats = fs.statSync(sysPath);
            const range = ctx.header("Range");
            const fileSize = stats.size;
            const encodedFileName = encodeURIComponent(fileName).replace(/%20/g, '+');
            if (range) {
                const [start, end] = range.replace(/bytes=/, "").split("-");
                const startByte = parseInt(start, 10);
                const endByte = end ? parseInt(end, 10) : fileSize - 1;
                if (startByte >= fileSize) {
                    ctx.res.status(416).send("Requested range not satisfiable");
                    return;
                }
                const chunkSize = endByte - startByte + 1;
                const readStream = fs.createReadStream(sysPath, {start: startByte, end: endByte});
                ctx.res.status(206);
                ctx.res.set({
                    "Content-Range": `bytes ${startByte}-${endByte}/${fileSize}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunkSize,
                    "Content-Type": mime.lookup(fileName) || "application/octet-stream",
                    "Content-Disposition": `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
                });
                readStream.pipe(ctx.res);
                return;
            }
            if (stats.isFile()) {
                let handle_type = "attachment";
                if (fileName.endsWith('.pdf')) {
                    handle_type = "inline";
                }
                ctx.res.set({
                    "Content-Type": mime.lookup(fileName) || "application/octet-stream",
                    "Content-Length": fileSize,
                    // "Cache-Control": "public, max-age=3600",
                    "Content-Disposition": `${handle_type}; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
                });
                // 发送文件
                const readStream = fs.createReadStream(sysPath);
                readStream.pipe(ctx.res);
                // ctx.res.body = fs.createReadStream(sysPath);
            } else {
                ctx.res.attachment(path.basename(sysPath) + ".zip");
                const archive = archiver('zip', { zlib: { level: 5 } });
                archive.pipe(ctx.res);
                archive.directory(sysPath, path.basename(sysPath));
                archive.finalize();
            }

        } else {
            const files: string [] = file;
            const archive = archiver('zip', {
                zlib: {level: 5} // 设置压缩级别
            });
            ctx.res.attachment("output.zip");
            ctx.res.set('Content-Type', 'application/octet-stream');
            // ctx.set('Content-Type', 'application/zip');
            // ctx.set('Content-Disposition', 'attachment; filename=output.zip');
            // const stream = new Stream.PassThrough()
            // ctx.res.body = stream
            // 将压缩后的文件流发送给客户端
            archive.pipe(ctx.res)
            for (const file of files) {
                const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(file));
                const stats = fs.statSync(sysPath);
                if (stats.isFile()) {
                    archive.file(sysPath, {name: path.basename(sysPath)});
                } else {
                    archive.directory(sysPath, path.basename(sysPath));
                }
            }
            archive.finalize();
        }
    }


    file_video_trans(data: WsData<FileVideoFormatTransPojo>) {
        const pojo = data.context as FileVideoFormatTransPojo;
        const wss = data.wss as Wss;
        const root_path = settingService.getFileRootPath(pojo.token);
        const sysPath = path.join(root_path, decodeURIComponent(pojo.source_filename));
        const sysPathNew = path.join(root_path, decodeURIComponent(pojo.to_filename));

        getFfmpeg()(sysPath)
            .toFormat(pojo.to_format)
            // .videoCodec('libx264')
            // .audioCodec('aac')
            .on('start', function (commandLine) {
                const result = new WsData<SysPojo>(CmdType.file_video_trans_progress);
                result.context = 0;
                wss.sendData(result.encode());
            })
            .on('progress', function (progress) {
                const result = new WsData<SysPojo>(CmdType.file_video_trans_progress);
                result.context = progress.percent.toFixed(0);
                wss.sendData(result.encode());
            })
            .on('error', function (err, stdout, stderr) {
                wss.ws.close();
            })
            .on('end', function () {
                const result = new WsData<SysPojo>(CmdType.file_video_trans_progress);
                result.context = 100;
                wss.sendData(result.encode());
            })
            .save(sysPathNew);
    }

    async uncompress(data: WsData<FileCompressPojo>) {
        const pojo = data.context as FileCompressPojo;
        userService.check_user_auth(pojo.token, UserAuth.filecat_file_context_update_upload_created_copy_decompression);

        const source_file = decodeURIComponent(pojo.source_file);
        const tar_dir = decodeURIComponent(pojo.tar_dir ?? "");
        const directoryPath = decodeURIComponent(path.dirname(source_file));
        const root_path = settingService.getFileRootPath(pojo.token);
        const targetFolder = path.join(root_path, directoryPath, tar_dir);
        userService.check_user_path(pojo.token, targetFolder);
        userService.check_user_only_path(pojo.token, targetFolder);

        const wss = data.wss as Wss;
        if (tar_dir) {
            fs.mkdirSync(path.join(targetFolder), {recursive: true});
        }
        const sysSourcePath = path.join(root_path, source_file);
        userService.check_user_path(pojo.token, sysSourcePath)
        const outHanle = (value) => {
            if (value === -1) {
                wss.ws.close();
                return;
            }
            const result = new WsData<SysPojo>(CmdType.file_uncompress_progress);
            result.context = value;
            wss.sendData(result.encode());
        };
        if (pojo.format === FileCompressType.tar) {
            this.unTar(sysSourcePath, targetFolder, outHanle)
        } else if (pojo.format === FileCompressType.zip) {
            this.unZip(sysSourcePath, targetFolder, outHanle)
        } else if (pojo.format === FileCompressType.gzip) {
            this.unTar(sysSourcePath, targetFolder, outHanle, true)
        } else if (pojo.format === FileCompressType.rar) {
            try {
                await this.unRar(sysSourcePath, targetFolder, outHanle)
            } catch (e) {
                wss.ws.close();
            }
        } else {
            wss.ws.close();
        }
    }

    FileCompress(data: WsData<FileCompressPojo>) {
        const pojo = data.context as FileCompressPojo;
        userService.check_user_auth(pojo.token, UserAuth.filecat_file_context_update_upload_created_copy_decompression);

        const files = pojo.filePaths;
        const root_path = settingService.getFileRootPath(pojo.token);
        const wss = data.wss as Wss;
        const filePaths: string[] = [], directorys: string[] = [];
        for (const file of files) {
            const name = path.join(root_path, decodeURIComponent(file));
            userService.check_user_path(pojo.token, name);
            userService.check_user_only_path(pojo.token, name);
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
        const targerFilePath = path.join(root_path, decodeURIComponent(pojo.tar_filename));
        this.compress(format, pojo.compress_level, targerFilePath, filePaths, directorys, (value) => {
            if (value === -1) {
                wss.ws.close();
                return;
            }
            const result = new WsData<SysPojo>(CmdType.file_compress_progress);
            result.context = value;
            wss.sendData(result.encode());
        }, pojo.format === FileCompressType.gzip);
    }

    getTotalFile(data: { files: string[], total: number }, filepath: string) {
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
            this.getTotalFile(data, p);
        }
    }

    async studio_get_item(param_path: string, token: string) {
        const result: { list: FileTreeList } = {
            list: []
        };
        const sysPath = path.join(settingService.getFileRootPath(token), param_path ? decodeURIComponent(param_path) : "");
        if (!fs.existsSync(sysPath)) {
            return Fail("路径不存在", RCode.Fail);
        }
        const stats = fs.statSync(sysPath);
        if (stats.isFile()) {
            return Fail("是文件", RCode.Fail);
        }
        const items = fs.readdirSync(sysPath);// 读取目录内容
        for (const item of items) {
            const filePath = path.join(sysPath, item);
            // 获取文件或文件夹的元信息
            let stats: null | Stats = null;
            try {
                stats = fs.statSync(filePath);
            } catch (e) {
                continue;
            }
            result.list.push({
                type: stats.isFile() ? "file" : "folder",
                name: item
            })
        }
        return result;
    }

    public async getDiskSizeForPath(fpath) {
        const pojo: FileInfoItemData = {};
        try {
            // 获取磁盘信息
            const diskData = await si.fsSize();
            // 解析路径对应的磁盘（例如 C:/）
            const dirPath = path.resolve(fpath);
            let targetDisk;
            diskData.forEach(disk => {
                if (dirPath.startsWith(disk.mount)) {
                    if (!targetDisk) {
                        targetDisk = disk;
                        return;
                    } else {
                        if (disk.mount.length > targetDisk.mount.length) {
                            targetDisk = disk;
                        }
                    }
                }
            })
            // const targetDisk = diskData.find(disk => dirPath.startsWith(disk.mount));
            if (targetDisk) {
                pojo.path = dirPath;
                pojo.name = path.basename(fpath);
                pojo.total_size = formatFileSize(targetDisk.size);
                pojo.left_size = formatFileSize(targetDisk.available);
                pojo.fs_type = targetDisk.type;
                // pojo.used_size = targetDisk.used;
            }
        } catch (error) {
            console.error('Error fetching disk information:', error);
            return pojo;
        }
        return pojo;
    }

    isFirstByte(byte) {
        // 确保 byte 是一个有效的字节 (0 - 255)
        if (byte === undefined || byte < 0 || byte > 255) {
            throw 'Invalid byte';
        }
        // 1 字节: 0xxxxxxx (0x00 ~ 0x7F)  不需要校验
        // 2 字节: 110xxxxx (0x80 ~ 0x7FF)
        // 3 字节: 1110xxxx (0x800 ~ 0xFFFF)
        // 4 字节: 11110xxx (0x10000 ~ 0x10FFFF)
        // 使用掩码和位运算判断
        return (byte & 0xE0) === 0xC0 || (byte & 0xF0) === 0xE0 || (byte & 0xF8) === 0xF0;
    }


    go_forward_log(pojo: LogViewerPojo, file_path) {
        // 开始查找
        let linesRead = 0; // 行数
        let haveReadSize = 0; // 已经读取的字节数
        const fd = fs.openSync(file_path, "r");
        let max_count = 100;
        while (haveReadSize < pojo.once_max_size) {
            if (max_count <= 0) {
                break;
            }
            max_count--;
            // 创建一个 10 kb字节的缓冲区
            const buffer = Buffer.alloc(10240);
            // 返回实际读取的字节数
            let bytesRead = fs.readSync(fd, buffer,
                0, // 相对于当前的偏移位置
                buffer.length, // 读取的长度
                pojo.position // 当前位置
            );
            // 遍历 buffer 中的每一个字节
            let done = false;
            let last_h = -1; // 上一个/n 未开始的也算 /n 都是不包括
            for (let i = 0, ch_byte_i = bytesRead - 1; i < bytesRead; i++) {
                // 如果字节是换行符 '\n'（ASCII值为 10）
                if (buffer[i] === 10 || i === ch_byte_i) { // 换行或者 最后一个字符
                    let index = i;
                    if (i === ch_byte_i && (buffer[i] & 0x80) !== 0) {
                        // 最后一位 不是单字节字符 需要找到首字节
                        for (let j = i; j > last_h; j--) {
                            if (this.isFirstByte(buffer[j])) {
                                index = j - 1;
                                break;
                            }
                        }
                    }
                    linesRead++;
                    // 以/n做字符串结尾，扫描到的/n 或者文件的最后一个字符
                    const now_str_start = last_h + 1;
                    const next_str_start = index + 1;
                    pojo.context_list.push(buffer.toString('utf8', now_str_start, next_str_start)); // i 不包括 /n
                    pojo.context_start_position_list.push(pojo.position + now_str_start); // 开始位置
                    pojo.context_position_list.push(pojo.position + next_str_start); // 结束位置 是/n的位置
                    if (linesRead >= pojo.line) {
                        done = true;
                        break;
                    }
                    last_h = index;
                }
            }

            if (done || bytesRead === 0) {
                break;
            } else {
                haveReadSize += last_h;
                // 更新文件位置
                pojo.position += last_h + 1; // 往前进一个字符
            }
        }
        // 关闭文件
        fs.closeSync(fd);
        // if(pojo.find_back_enter_index && pojo.context_list.length >0) {
        //     for (let i=0 ;i<pojo.context_list.length;i++) {
        //         const regex = new RegExp(pojo.query_text, 'g');
        //         pojo.context_list[i] = pojo.context_list[i].replace(regex, `<span style="color: blue;">${pojo.query_text}</span>`);
        //     }
        // }
        return pojo;
    }

    /**
     * 往后搜索找到最近的换行符
     * @param pojo
     * @param file_path
     * @param max_len 往后最长的距离
     */
    find_back_enter_index(pojo: LogViewerPojo, file_path, max_len = 10240) {
        const fd = fs.openSync(file_path, "r");
        let buffer_len = max_len;
        if (pojo.position < buffer_len) {
            buffer_len = pojo.position; // 全部读完
        }
        let buffer = Buffer.alloc(buffer_len); // 缓冲区满足当前位置往前移动的距离
        const position = pojo.position - buffer.length; // 位置前移
        // 返回实际读取的字节数
        const bytesRead = fs.readSync(fd, buffer,
            0, // 相对于当前的偏移位置
            buffer.length, // 读取的长度
            position // 当前位置 往前推进了一点
        );
        for (let i = bytesRead; i >= 0; i--) {
            let index = i;
            // 如果字节是换行符 '\n'（ASCII值为 10）
            if (buffer[i] === 10 || i === 0) {
                if ((buffer[i] & 0x80) !== 0) {
                    // 找到首字节
                    for (let j = 0; j < bytesRead; j++) {
                        if (this.isFirstByte(buffer[j])) {
                            index = j - 1;
                            break;
                        }
                    }
                }
                const now_str_start = index === 0 && pojo.position === 0 ? 0 : index + 1;
                pojo.position = position + now_str_start;
                fs.closeSync(fd);
                return;
            }
        }
        fs.closeSync(fd);
        pojo.position = position;
    }

    go_back_log(pojo: LogViewerPojo, file_path) {
        // 开始查找
        let linesRead = 0; // 行数
        let haveReadSize = 0; // 已经读取的字节数
        const fd = fs.openSync(file_path, "r");
        let buffer_len = 10240;
        let max_count = 100;
        while (haveReadSize < pojo.once_max_size) {
            if (max_count <= 0) {
                break;
            }
            max_count--;
            if (pojo.position < buffer_len) {
                // buffer_len = Math.floor(pojo.position / 2);
                buffer_len = pojo.position; // 全部读完
            }
            let buffer = Buffer.alloc(buffer_len); // 缓冲区满足当前位置往前移动的距离
            pojo.position = pojo.position - buffer.length; // 位置前移
            // 返回实际读取的字节数
            const bytesRead = fs.readSync(fd, buffer,
                0, // 相对于当前的偏移位置
                buffer.length, // 读取的长度
                pojo.position // 当前位置 往前推进了一点
            );

            // 遍历 buffer 中的每一个字节
            let done = false;
            let last_h = bytesRead; // 上一个 \n
            for (let i = bytesRead; i >= 0; i--) {
                let index = i;
                // 如果字节是换行符 '\n'（ASCII值为 10）
                if (buffer[i] === 10 || i === 0) {
                    if (i === 0 && pojo.position !== 0 && (buffer[i] & 0x80) !== 0) {
                        // 找到首字节
                        for (let j = 0; j < last_h; j++) {
                            if (this.isFirstByte(buffer[j])) {
                                index = j - 1;
                                break;
                            }
                        }
                    }
                    linesRead++;
                    const now_str_start = index === 0 && pojo.position === 0 ? 0 : index + 1;
                    const next_str_start = last_h + 1;
                    pojo.context_list.push(buffer.toString('utf8', now_str_start, next_str_start));
                    pojo.context_start_position_list.push(pojo.position + now_str_start);
                    pojo.context_position_list.push(pojo.position + next_str_start);
                    if (linesRead >= pojo.line) {
                        done = true;
                        break;
                    }
                    last_h = index;
                }
            }

            if (done || bytesRead === 0 || (last_h <= 0 && pojo.position === 0)) {
                break;
            } else {
                haveReadSize += (bytesRead - last_h);
                // 更新文件位置
                pojo.position -= last_h - 1;
            }
        }
        // 关闭文件
        fs.closeSync(fd);
        return pojo;
    }

    log_viewer(data: WsData<LogViewerPojo>) {
        const pojo = data.context as LogViewerPojo;
        pojo.context = "";
        pojo.context_list = [];
        pojo.context_position_list = [];
        pojo.context_start_position_list = [];
        const root_path = settingService.getFileRootPath(pojo.token);
        const file_path = path.join(root_path, decodeURIComponent(pojo.path));
        // 获取文件的元数据
        const stats = fs.statSync(file_path);
        // 文件当前的最大大小
        const fileSize = stats.size;
        pojo.max_size = fileSize;
        if ((pojo.position <= 0 && pojo.back) || (!pojo.back && pojo.position >= fileSize)) {
            pojo.context = '';
            return pojo;
        }
        if (pojo.back) return this.go_back_log(pojo, file_path);
        if (pojo.find_back_enter_index) this.find_back_enter_index(pojo, file_path, 100);
        return this.go_forward_log(pojo, file_path);
    }

    file_change_watcher_map = new Map();

    log_viewer_watch(data: WsData<LogViewerPojo>) {
        const pojo = data.context as LogViewerPojo;
        if (this.file_change_watcher_map.has(pojo.token)) {
            return;
        }

        const wss = data.wss as Wss;
        pojo.context = "";
        pojo.context_list = [];
        pojo.context_position_list = [];
        pojo.context_start_position_list = [];
        const root_path = settingService.getFileRootPath(pojo.token);
        const file_path = path.join(root_path, decodeURIComponent(pojo.path));
        // 使用 chokidar 监控文件变化
        let watcher = chokidar.watch(file_path, {
            persistent: true,  // 持续监听
            usePolling: true, // 使用事件驱动模式（默认是）
            // interval: 100,     // 轮询间隔（如果启用了轮询模式）
        });
        this.file_change_watcher_map.set(pojo.token, watcher);
        wss.setClose(() => {
            watcher.close();
            this.file_change_watcher_map.delete(pojo.token);
        })
        // 已读取的字节数
        let bytesRead = pojo.max_size;
        // 监听文件变化事件
        watcher.on('change', (changedFilePath) => {
            if (changedFilePath === file_path) {
                // 获取当前文件的状态
                fs.stat(file_path, (err, stats) => {
                    if (err) {
                        console.error('Failed to get file stats:', err);
                        watcher.close();
                        this.file_change_watcher_map.delete(pojo.token);
                        return;
                    }
                    if (stats.size > bytesRead) {  // 文件变大
                        // 文件变大，创建新的读取流
                        const newStream = fs.createReadStream(file_path, {encoding: 'utf8', start: bytesRead});
                        newStream.on('data', (chunk) => {
                            const str = chunk.toString();
                            let now_str_start = bytesRead;
                            let next_str_start = bytesRead + chunk.length + 1; // todo +1?
                            let index = 0;
                            for (let i = 0; i < str.length; i++) {
                                if (!/^\s$/.test(str[i])) {
                                    // 不是空白字符
                                    break;
                                } else if (str[i] === '\n' && chunk.length - 1 > i) {
                                    index = i + 1;
                                    now_str_start = bytesRead + index;
                                    next_str_start + index;
                                    break;
                                }
                            }
                            // send
                            pojo.context_list.push(str.slice(index, chunk.length));
                            pojo.context_start_position_list.push(now_str_start);
                            pojo.context_position_list.push(next_str_start);
                            pojo.max_size = bytesRead + chunk.length;
                            const result = new WsData<SysPojo>(CmdType.log_viewer_watch);
                            result.context = pojo;
                            wss.sendData(result.encode());
                            bytesRead += Buffer.byteLength(chunk, 'utf8'); // chunk 是字符串而不是字节流 所以要求实际长度一下

                            // init
                            pojo.context_list = [];
                            pojo.context_position_list = [];
                            pojo.context_start_position_list = [];
                        });
                    }
                });
            }
        });
        // 监听错误
        watcher.on('error', (error) => {
            watcher.close();
            this.file_change_watcher_map.delete(pojo.token);
        });
    }
}

export const FileServiceImpl = new FileService();
