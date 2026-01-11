import {
    base64UploadType,
    FileCompressPojo,
    FileCompressType,
    FileInfoItemData,
    FileTreeList,
    FileTypeEnum,
    FileVideoFormatTransPojo,
    GetFilePojo,
    LogViewerPojo
} from "../../../common/file.pojo";
// import {config} from "../../other/config";
import fs, {Stats, WriteStream} from "fs";
import fse from 'fs-extra'
import path from "path";
import {Fail, Result, Sucess} from "../../other/Result";
import {rimraf} from "rimraf";
import {cutCopyReq, fileInfoReq, ws_file_upload_req} from "../../../common/req/file.req";
import {formatFileSize} from "../../../common/ValueUtil";
import {settingService} from "../setting/setting.service";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {SysPojo} from "../../../common/req/sys.pojo";
import {RCode} from "../../../common/Result.pojo";
import {FileCompress} from "./file.compress";
import {getFfmpeg} from "../bin/bin";
import {getFileFormat} from "../../../common/FileMenuType";
import {removeTrailingPath} from "../../../common/StringUtil";
import si from "systeminformation";
import multer from 'multer';
import {Request, Response} from "express";
import {userService} from "../user/user.service";
import {UserAuth} from "../../../common/req/user.req";
import {FileUtil} from "./FileUtil";
import {node_process_watcher} from "node-process-watcher";
import {list_paginate} from "../../../common/ListUtil";

const archiver = require('archiver');
const mime = require('mime-types');

const chokidar = require('chokidar');
const iconv = require('iconv-lite');

// const encodings = [
//     'utf8', 'utf-8', 'utf16le', 'ucs2',
//     'ascii', 'latin1', 'iso-8859-1', 'windows1252',
//     'iso-8859-2', 'iso-8859-3', 'iso-8859-4', 'iso-8859-5',
//     'iso-8859-6', 'iso-8859-7', 'iso-8859-8', 'iso-8859-9',
//     'iso-8859-10', 'iso-8859-13', 'iso-8859-14', 'iso-8859-15',
//     'iso-8859-16',
//     'windows-1250', 'windows-1251', 'windows-1252', 'windows-1253',
//     'windows-1254', 'windows-1255', 'windows-1256', 'windows-1257',
//     'windows-1258',
//     'gbk', 'gb2312', 'gb18030', 'big5',
// ];

export class FileService extends FileCompress {

    utf8ToEncoding(utf8Str, targetEncoding, outputFormat = 'buffer') {
        // 1. 将 UTF-8 字符串编码为目标编码的 Buffer
        const buffer = iconv.encode(utf8Str, targetEncoding);

        // 2. 根据 outputFormat 返回不同格式
        switch (outputFormat.toLowerCase()) {
            case 'buffer':
                return buffer; // 直接返回 Buffer
            case 'hex':
                return buffer.toString('hex'); // 返回 Hex 字符串
            case 'base64':
                return buffer.toString('base64'); // 返回 Base64 字符串
            case 'string':
                // 仅部分编码（如 'latin1'）可以直接转字符串，其他可能乱码
                if (['latin1', 'iso-8859-1'].includes(targetEncoding.toLowerCase())) {
                    return buffer.toString('binary'); // 'binary' 是 Latin1 的别名
                } else {
                    throw new Error(`outputFormat 'string' 仅支持 'latin1' 或 'iso-8859-1' 编码`);
                }
            default:
                throw new Error(`不支持的 outputFormat: ${outputFormat}，可选 'buffer' | 'hex' | 'base64' | 'string'`);
        }
    }

    public async getFile(param_path, token, is_sys_path?: number): Promise<Result<GetFilePojo | string>> {
        const result: GetFilePojo = {
            files: [],
            folders: []
        };
        if (is_sys_path === 1 && decodeURIComponent(param_path) === "/etc/fstab") {
            userService.check_user_auth(token, UserAuth.sys_disk_mount);
        }
        const root_path = settingService.getFileRootPath(token);
        const sysPath = is_sys_path === 1 ? `${decodeURIComponent(param_path)}` : path.join(root_path, param_path ? decodeURIComponent(param_path) : "");
        userService.check_user_path(token, sysPath)
        if (!await FileUtil.access(sysPath)) {
            return Fail("路径不存在", RCode.Fail);
        }
        const stats = await FileUtil.statSync(sysPath);
        if (stats.isFile()) {
            // 单个文件
            // if (stats.size > MAX_SIZE_TXT) {
            //     return Fail("超过20MB", RCode.File_Max);
            // }
            const name = path.basename(sysPath);
            const buffer = await FileUtil.readFileSync(sysPath);
            const pojo = Sucess(buffer.toString(), RCode.PreFile);
            pojo.message = name;
            return pojo;
        }

        const items = await FileUtil.readdirSync(sysPath);// 读取目录内容
        for (const item of items) {
            const filePath = path.join(sysPath, item);
            // 获取文件或文件夹的元信息
            let stats: null | Stats = null;
            try {
                stats = await FileUtil.statSync(filePath);
            } catch (e) {
                console.log("读取错误", e);
            }
            const mtime = stats ? new Date(stats.mtime).getTime() : 0;
            // const formattedCreationTime = stats ? getShortTime(new Date(stats.mtime).getTime()) : "";
            // const size = stats ? formatFileSize(stats.size) : "";
            if (stats && stats.isFile()) {
                const type = getFileFormat(item);
                result.files?.push({
                    type: type,
                    name: item,
                    mtime: mtime,
                    size: stats.size,
                    isLink: stats?.isSymbolicLink(),
                    path: path.join(param_path, item)
                })
            } else if (stats && stats.isDirectory()) {
                result.folders?.push({
                    type: FileTypeEnum.folder,
                    name: item,
                    mtime: mtime,
                    isLink: stats?.isSymbolicLink(),
                    path: param_path
                })
            } else {
                result.files?.push({
                    type: FileTypeEnum.dev,
                    name: item,
                    mtime: mtime,
                    size: stats?.size,
                    path: path.join(param_path, item)
                })
            }
        }
        return Sucess(result);
    }

    public async get_list(token: string, param_path:string, page_num:number, page_size:number, search?:string) {
        const result: GetFilePojo = {
            files: []
        };
        const root_path = settingService.getFileRootPath(token);
        const sysPath = path.join(root_path, param_path ? decodeURIComponent(param_path) : "");
        userService.check_user_path(token, sysPath)
        let items = await FileUtil.readdirSync(sysPath);// 读取目录内容
        items = list_paginate(items, page_num,page_size).list;
        for (const item of items) {
            const filePath = path.join(sysPath, item);
            // 获取文件或文件夹的元信息
            let stats: null | Stats = null;
            try {
                stats = await FileUtil.statSync(filePath);
            } catch (e) {
                console.log("读取错误", e);
            }
            let type:FileTypeEnum
            let p:string
            let size
            if(!stats) continue;
            if(stats.isFile()) {
                type = getFileFormat(item);
                p = path.join(param_path, item)
                size = stats.size
            } else if(stats.isDirectory()) {
                type = FileTypeEnum.folder;
                p = param_path
            } else {
                type = FileTypeEnum.dev;
                p = path.join(param_path, item)
                size = stats.size
            }
            const mtime = stats ? new Date(stats.mtime).getTime() : 0;

            const pojo = {
                type,
                name: item,
                mtime: mtime,
                size,
                isLink: stats?.isSymbolicLink(),
                path: p
            }
            result.files.push(pojo)
        }
        return Sucess(result);
    }

    // folder_size_info:Map<string,{num:number,size:number}> = new Map();
    public async get_folder_info(fpath: string, token, wss: Wss) {
        const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(fpath));
        userService.check_user_path(token, sysPath);
        node_process_watcher.on_folder_size(sysPath, (file_num: number, total_size: number) => {
            wss.send(CmdType.folder_size_info, [file_num, total_size]);
        });
        wss.setClose(() => {
            node_process_watcher.stop_folder_size(sysPath);
        })
    }

    public async stop_folder_info(fpath: string, token) {
        const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(fpath));
        userService.check_user_path(token, sysPath);
        node_process_watcher.stop_folder_size(sysPath);
    }

    public async getFileInfo(type: FileTypeEnum, fpath: string, token, wss?: Wss) {
        let info: FileInfoItemData = {};
        const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(fpath));
        userService.check_user_path(token, sysPath)
        switch (type) {
            case FileTypeEnum.folder:
                if (wss) {
                    this.getDiskSizeForPath(sysPath).then(data => {
                        const result = new WsData<SysPojo>(CmdType.file_info);
                        result.context = data;
                        wss.sendData(result.encode())
                    }).catch(error => {
                        console.log(error);
                    })
                } else {
                    info = await this.getDiskSizeForPath(sysPath);
                }
                break;
            case FileTypeEnum.upload_folder: {
                const list = settingService.get_dir_upload_max_num();
                for (const it of list) {
                    if (userService.isSubPath(it.path, sysPath)) {
                        info.dir_upload_max_num_value = it;
                    }
                }
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

    upload_num_set = {} as any;

    public async uploadFile(filePath, req: Request, res: Response, token) {

        const sysPath = path.join(settingService.getFileRootPath(token), filePath ? decodeURIComponent(filePath) : "");
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);
        // if (!file) {
        //     // 目录
        if ((req.query.dir === "1")) {
            // 目录不存在，创建目录
            if (!await FileUtil.access(sysPath)) await FileUtil.mkdirSync(sysPath, {recursive: true});
            return;
        }
        //     return;
        // }
        let upload_max_key;
        let max_num;
        for (const it of settingService.get_dir_upload_max_num()) {
            if (userService.isSubPath(it.path, sysPath) && it.sys_upload_num !== undefined) {
                upload_max_key = it.path;
                max_num = it.sys_upload_num;
            }
        }
        if (upload_max_key) {
            let v = this.upload_num_set[upload_max_key];
            if (v === undefined) {
                v = 1;
            } else {
                v++;
            }
            if (v > max_num) throw " upload file num max ";
            this.upload_num_set[upload_max_key] = v;
        }
        req['fileDir'] = path.dirname(sysPath);
        req['fileName'] = path.basename(sysPath);
        req.on('close', () => {
            // console.log('PUT 请求上传断开（连接意外关闭）');
            if (upload_max_key) {
                if (this.upload_num_set[upload_max_key]) {
                    this.upload_num_set[upload_max_key]--;
                }
            }
        });
        return new Promise((resolve) => {
            try {
                this.upload(req, res, (err) => {
                    if (err) {
                        console.log(err);
                    }
                    // 成功上传
                    if (upload_max_key) {
                        if (this.upload_num_set[upload_max_key]) {
                            this.upload_num_set[upload_max_key]--;
                        }
                    }
                    resolve(1);
                });
            } catch (e) {
                if (upload_max_key) {
                    if (this.upload_num_set[upload_max_key]) {
                        this.upload_num_set[upload_max_key]--;
                    }
                }
                resolve(1);
            }
        })
        // 写入文件
        // fs.writeFileSync(sysPath, file.buffer);
        //multer 默认使用 return new Multer({}) 默认memoryStorage 这种方式 buffer 不属于v8内存管理  所以内存释放的比较慢
    }

    file_upload_count_map = new Map<string, {
        // part_size: number,
        upload_data_size: number,
        wss: Wss,
        lastModified: number,
        buffer_list: Uint8Array[],
        sys_file_max_num?: number,
        sys_file_upload_max_key?: string,
        parallel_done_num: number,
        writeStream: WriteStream
    }>();

    // file_upload_map = new Map<string, ws_file_upload_req>();

    async file_upload_pre(data: WsData<ws_file_upload_req>) {
        const param = data.context as ws_file_upload_req;
        const token = (data.wss as Wss).token;
        // const sysPath = path.join(settingService.getFileRootPath(token), param.file_path);
        const sysPath = path.join(settingService.getFileRootPath(token), param.file_path ? decodeURIComponent(param.file_path) : "");
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);
        if (param.is_dir) {
            // 目录不存在，创建目录
            if (!await FileUtil.access(sysPath))
                await FileUtil.mkdirSync(sysPath, {recursive: true});
            return;
        }
        // 系统文件数量限制
        let max_num;
        let upload_max_key;
        for (const it of settingService.get_dir_upload_max_num()) {
            if (userService.isSubPath(it.path, sysPath) && it.sys_upload_num !== undefined) {
                upload_max_key = it.path;
                max_num = it.sys_upload_num;
            }
        }
        if (upload_max_key) {
            let v = this.upload_num_set[upload_max_key];
            if (v === undefined) {
                v = 1;
            } else {
                v++;
            }
            if (v > max_num) throw " upload file num max ";
            this.upload_num_set[upload_max_key] = v;
        }
        (data.wss as Wss).setClose(() => {
            // 虽然会添加多个 但是断开的时候都会消失
            if (upload_max_key) {
                if (this.upload_num_set[upload_max_key]) {
                    this.upload_num_set[upload_max_key]--;
                }
            }
        })

        let value = this.file_upload_count_map.get(sysPath);
        if (value) {
            // 有历史上传进度存在
            value.buffer_list = new Array(param.parallel_done_num).fill(undefined);
            value.parallel_done_num = 0;
            if (param.lastModified !== value.lastModified) {
                if (await FileUtil.access(sysPath)) {
                    await FileUtil.unlinkSync(sysPath);  // 删除文件
                }
            } else if (await FileUtil.access(sysPath)) {
                // 文件存在 返回历史 文件
                return {upload_data_size: value.upload_data_size};
            }
        }
        // if (fs.existsSync(sysPath)) {
        //     fs.unlinkSync(sysPath);  // 删除文件
        // }
        this.lifeStart(sysPath, upload_max_key, async (key) => {
            this.file_upload_count_map.delete(upload_max_key);
            value.writeStream.end();
            value.buffer_list = null;
            this.file_upload_count_map.delete(sysPath);
        });
        if (await FileUtil.access(sysPath)) {
            await FileUtil.truncateSync(sysPath); // 清空内容
        }
        param.file_full_path = sysPath;
        // this.file_upload_map.set(sysPath, param);
        // const part_size = 2; // 先写死为 2
        value = {
            // part_size: part_size,
            upload_data_size: 0,
            wss: (data.wss as Wss),
            lastModified: param.lastModified,
            buffer_list: new Array(param.parallel_done_num).fill(undefined),
            sys_file_max_num: max_num,
            sys_file_upload_max_key: upload_max_key,
            parallel_done_num: 0,
            writeStream: fs.createWriteStream(sysPath)
        }
        this.file_upload_count_map.set(sysPath, value);
        return {upload_data_size: value.upload_data_size};
    }

    async file_upload(data: WsData<ws_file_upload_req>) {
        const param = data.context as ws_file_upload_req;
        const token = (data.wss as Wss).token;

        // const sysPath = path.join(settingService.getFileRootPath(token), param.file_path);
        const sysPath = path.join(settingService.getFileRootPath(token), param.file_path ? decodeURIComponent(param.file_path) : "");
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);
        this.lifeHeart(sysPath);

        const num_value = this.file_upload_count_map.get(sysPath);
        try {
            num_value.buffer_list[param.part_count] = data.bin_context; // Buffer.concat([num_value.buffer,chunkData]);
            delete data.bin_context;
            // console.log(param.chunk_index)
            num_value.parallel_done_num++;
            if (num_value.parallel_done_num !== param.parallel_done_num) {
                return;
            }
            num_value.parallel_done_num = 0;
            // console.log(param.chunk_index);
            // 写入块数据到文件
            // const add_chunk = Buffer.concat(num_value.buffer_list);
            for (const add_chunk of num_value.buffer_list) {
                // fs.appendFileSync(sysPath,add_chunk );
                num_value.writeStream.write(add_chunk);
                num_value.upload_data_size += add_chunk.length;
            }
            num_value.buffer_list.length = 0;
            num_value.buffer_list = new Array(param.parallel_done_num).fill(undefined);

            // 如果所有块都上传完
            if (param.chunk_index === param.total_chunk_index - 1) {
                if (num_value.sys_file_upload_max_key) {
                    if (this.upload_num_set[num_value.sys_file_upload_max_key]) {
                        this.upload_num_set[num_value.sys_file_upload_max_key]--;
                    }
                }
                this.file_upload_count_map.delete(sysPath);
                num_value.writeStream.end();
            }
        } catch (e) {
            console.log(e);
            if (num_value.sys_file_upload_max_key) {
                if (this.upload_num_set[num_value.sys_file_upload_max_key]) {
                    this.upload_num_set[num_value.sys_file_upload_max_key]--;
                }
            }
            num_value.writeStream.end();
            this.file_upload_count_map.delete(sysPath);
        }
    }

    public async deletes(token, filePath?: string) {
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
                if (await FileUtil.access(p)) {
                    p = await FileUtil.getUniqueFileName(p);
                }
                await this.cut_exec(sysPath, p);
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
        const stats = await FileUtil.statSync(sysPath);
        if (stats.isFile()) {
            await FileUtil.unlinkSync(sysPath)
        } else {
            await rimraf(sysPath);
        }
        return Sucess("1");
    }

    public async save(token, context?: string, filePath?: string, is_sys_path?: number) {
        if (context === null || context === undefined) {
            return;
        }
        const sysPath = is_sys_path === 1 ? `/${filePath}` : path.join(settingService.getFileRootPath(token), filePath ? decodeURIComponent(filePath) : "");
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);
        // const sysPath = path.join(settingService.getFileRootPath(token),filePath?decodeURIComponent(filePath):"");
        // 写入文件
        await FileUtil.writeFileSync(sysPath, context);
    }

    // public common_save(path:string,context:string) {
    //     fs.writeFileSync(path, context);
    // }

    public async common_base64_save(token: string, filepath: string, base64_context: string, type: base64UploadType) {
        const sysPath = path.join(settingService.getFileRootPath(token), filepath);
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);
        const binaryData = Buffer.from(base64_context, 'base64');
        if (type === base64UploadType.all || type === base64UploadType.start) {
            await FileUtil.writeFileSync(sysPath, binaryData);
        } else if (type === base64UploadType.part) {
            await FileUtil.appendFileSync(sysPath, binaryData);
        }
    }

    public async cut(token, data?: cutCopyReq) {
        if (!data) {
            return;
        }
        const root_path = settingService.getFileRootPath(token);
        const sysPath = path.join(root_path);
        const toSysPath = path.join(root_path, data.to ? decodeURIComponent(data.to) : "");
        userService.check_user_path(token, sysPath)
        userService.check_user_path(token, toSysPath)
        for (const file of data.files) {
            await this.cut_exec(decodeURIComponent(path.join(sysPath, file)), decodeURIComponent(path.join(toSysPath, path.basename(file))))
        }
    }

    public async cut_exec(source_path: string, to_file: string) {
        await FileUtil.renameSync(source_path, to_file);
        await rimraf(source_path);
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
        if (await FileUtil.access(sysPath)) {
            return;
        }
        if (type === 1) {
            // 创建目录
            await FileUtil.mkdirSync(sysPath, {recursive: true})
            // fs.mkdirSync(sysPath, {recursive: true});
        } else {
            await FileUtil.writeFileSync(sysPath, data.context ?? "");
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

    download_one_file(file_name: string, file_size: number, file_path: string, res: Response, param?: {
        handle_type_?: "attachment" | "inline",
        cache?: boolean,
        cache_length?: number, // 过期时间长度
    }) {
        const encodedFileName = encodeURIComponent(file_name).replace(/%20/g, '+');
        let handle_type = "";
        if (param?.handle_type_ !== undefined) {
            handle_type = param.handle_type_;
        } else {
            handle_type = "attachment";
            if (file_name.endsWith('.pdf')) {
                handle_type = "inline";
            }
        }
        res.set({
            "Content-Type": mime.lookup(file_name) || "application/octet-stream",
            "Content-Length": file_size,
            // "Cache-Control": "public, max-age=3600",
            "Content-Disposition": `${handle_type}; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
        });
        if (param?.cache) {
            res.setHeader('Cache-Control', 'public, max-age=86400 '); // 24 小时
        } else if (param?.cache_length) {
            res.setHeader('Cache-Control', `public, max-age=${param.cache_length}`);
        }
        // 发送文件
        const readStream = fs.createReadStream(file_path);
        readStream.pipe(res);
    }

    async download(ctx) {
        const file = ctx.query.file;
        if (!file || !file.length) {
            ctx.res.status(404).send('File not found');
            return;
        }
        const token = ctx.query['token'];
        const cache = ctx.query['cache'];
        const show = ctx.query['show'];
        if (!Array.isArray(file)) {
            // 单个文件
            const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(file));
            const fileName = path.basename(sysPath)
            const stats = await FileUtil.statSync(sysPath);
            const range = ctx.header("Range");
            const fileSize = stats.size;
            if (range) {
                const encodedFileName = encodeURIComponent(fileName).replace(/%20/g, '+');
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
                this.download_one_file(fileName, fileSize, sysPath, ctx.res, {
                    cache: cache === "1",
                    handle_type_: show === "1" ? "inline" : "attachment"
                });
                // ctx.res.body = fs.createReadStream(sysPath);
            } else {
                ctx.res.attachment(path.basename(sysPath) + ".zip");
                const archive = archiver('zip', {zlib: {level: 5}});
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
                const stats = await FileUtil.statSync(sysPath);
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
        userService.check_user_auth(pojo.token, UserAuth.filecat_file_context_update_upload_created_copy_decompression);
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
            await FileUtil.mkdirSync(path.join(targetFolder), {recursive: true})
            // fs.mkdirSync(path.join(targetFolder), {recursive: true});
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

    async FileCompress(data: WsData<FileCompressPojo>) {
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
                const stats = await FileUtil.statSync(name);
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

    // getTotalFile(data: { files: string[], total: number }, filepath: string) {
    //     try {
    //         const stats = fs.statSync(filepath);
    //         if (stats.isFile()) {
    //             data.total += 1;
    //             data.files.push(filepath);
    //             return;
    //         }
    //     } catch (e) {
    //         return
    //     }
    //     const items = fs.readdirSync(filepath);// 读取目录内容
    //     for (const item of items) {
    //         const p = path.join(filepath, item);
    //         this.getTotalFile(data, p);
    //     }
    // }

    async studio_get_item(param_path: string, token: string) {
        const result: { list: FileTreeList } = {
            list: []
        };
        const sysPath = path.join(settingService.getFileRootPath(token), param_path ? decodeURIComponent(param_path) : "");
        userService.check_user_path(token, sysPath)
        if (!await FileUtil.access(sysPath)) {
            return Fail("路径不存在", RCode.Fail);
        }
        const stats = await FileUtil.statSync(sysPath);
        if (stats.isFile()) {
            return Fail("是文件", RCode.Fail);
        }
        const items = await FileUtil.readdirSync(sysPath);// 读取目录内容
        for (const item of items) {
            const filePath = path.join(sysPath, item);
            // 获取文件或文件夹的元信息
            let stats: null | Stats = null;
            try {
                stats = await FileUtil.statSync(filePath);
            } catch (e) {
                continue;
            }
            result.list.push({
                type: stats.isFile() ? "file" : "folder",
                name: item,
                size: stats.size
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

    // isFirstByte(byte) {
    //     // 确保 byte 是一个有效的字节 (0 - 255)
    //     if (byte === undefined || byte < 0 || byte > 255) {
    //         throw 'Invalid byte';
    //     }
    //     // 1 字节: 0xxxxxxx (0x00 ~ 0x7F)  不需要校验
    //     // 2 字节: 110xxxxx (0x80 ~ 0x7FF)
    //     // 3 字节: 1110xxxx (0x800 ~ 0xFFFF)
    //     // 4 字节: 11110xxx (0x10000 ~ 0x10FFFF)
    //     // 使用掩码和位运算判断
    //     return (byte & 0xE0) === 0xC0 || (byte & 0xF0) === 0xE0 || (byte & 0xF8) === 0xF0;
    // }
    isFirstByte(byte, encoding: string = "utf8") {
        if (byte === undefined || byte < 0 || byte > 255) throw 'Invalid byte';

        switch (encoding.toLowerCase()) {
            case 'utf8':
            case 'utf-8':
                // UTF-8 判断（和你写的一样）
                // if ((byte & 0x80) === 0) return true; // ASCII单字节
                return (byte & 0xE0) === 0xC0 || (byte & 0xF0) === 0xE0 || (byte & 0xF8) === 0xF0;

            case 'ascii':
            case 'latin1':
            case 'iso-8859-1':
            case 'windows-1252':
                // 单字节编码，所有字节都是首字节
                return true;

            case 'gbk':
            case 'gb2312':
                // GBK 双字节编码，首字节范围 0x81-0xFE，尾字节范围 0x40-0xFE（除0x7F）
                return byte >= 0x81 && byte <= 0xFE;

            case 'big5':
                // Big5 双字节编码，首字节范围 0x81-0xFE
                return byte >= 0x81 && byte <= 0xFE;

            // 其他编码可根据规范添加

            default:
                throw 'Unsupported encoding for isFirstByte';
        }
    }


    convertToUtf8(input, fromEncoding) {
        if (fromEncoding === 'utf8' || fromEncoding === 'utf-8') {
            // 如果是 utf8 编码，直接返回字符串（如果 input 是 Buffer，先转成字符串）
            return Buffer.isBuffer(input) ? input.toString('utf8') : input;
        }

        let buf;
        if (typeof input === 'string') {
            // 用 iconv-lite 编码字符串成对应编码的 Buffer
            buf = iconv.encode(input, fromEncoding);
        } else if (Buffer.isBuffer(input)) {
            buf = input;
        } else {
            throw new Error('输入必须是 Buffer 或字符串');
        }

        // 再用 iconv-lite 解码 Buffer 为 JS 字符串
        const str = iconv.decode(buf, fromEncoding);

        return str;
    }

    async go_forward_log(pojo: LogViewerPojo, file_path) {
        // 开始查找
        let linesRead = 0; // 行数
        let haveReadSize = 0; // 已经读取的字节数
        const fd = await FileUtil.open(file_path, "r");
        let max_count = 100;
        while (haveReadSize < pojo.once_max_size) {
            if (max_count <= 0) {
                break;
            }
            max_count--;
            // 创建一个 10 kb字节的缓冲区
            const buffer = Buffer.alloc(10240);
            // 返回实际读取的字节数
            let {bytesRead} = await fd.read(buffer,
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
                            if (this.isFirstByte(buffer[j], pojo.encoding)) {
                                index = j - 1;
                                break;
                            }
                        }
                    }
                    linesRead++;
                    // 以/n做字符串结尾，扫描到的/n 或者文件的最后一个字符
                    const now_str_start = last_h + 1;
                    const next_str_start = index + 1;
                    pojo.context_list.push(this.convertToUtf8(buffer.subarray(now_str_start, next_str_start), pojo.encoding)); // i 不包括 /n
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
        await fd.close();
        // fs.closeSync(fd);
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
    async find_back_enter_index(pojo: LogViewerPojo, file_path, max_len = 10240) {
        const fd = await FileUtil.open(file_path, "r");//fs.openSync(file_path, "r");
        let buffer_len = max_len;
        if (pojo.position < buffer_len) {
            buffer_len = pojo.position; // 全部读完
        }
        let buffer = Buffer.alloc(buffer_len); // 缓冲区满足当前位置往前移动的距离
        const position = pojo.position - buffer.length; // 位置前移
        // 返回实际读取的字节数
        const {bytesRead} = await fd.read(buffer,
            0, // 相对于当前的偏移位置
            buffer.length, // 读取的长度
            position // 当前位置 往前推进了一点
        );
        for (let i = bytesRead; i >= 0; i--) {
            let index = i;
            // 如果字节是换行符 '\n'（ASCII值为 10）
            if (buffer[i] === 10 || i === 0) {
                if ((buffer[i] & 0x80) !== 0) {
                    // 多字节编码 找到首字节
                    for (let j = 0; j < bytesRead; j++) {
                        if (this.isFirstByte(buffer[j], pojo.encoding)) {
                            index = j - 1;
                            break;
                        }
                    }
                }
                const now_str_start = index === 0 && pojo.position === 0 ? 0 : index + 1;
                pojo.position = position + now_str_start;
                // fs.closeSync(fd);
                await fd.close();
                return;
            }
        }
        // fs.closeSync(fd);
        await fd.close();
        pojo.position = position;
    }

    async go_back_log(pojo: LogViewerPojo, file_path) {
        // 开始查找
        let linesRead = 0; // 行数
        let haveReadSize = 0; // 已经读取的字节数
        const fd = await FileUtil.open(file_path, "r"); // fs.openSync(file_path, "r");
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
            const {bytesRead} = await fd.read(buffer,
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
                            if (this.isFirstByte(buffer[j], pojo.encoding)) {
                                index = j - 1;
                                break;
                            }
                        }
                    }
                    linesRead++;
                    const now_str_start = index === 0 && pojo.position === 0 ? 0 : index + 1;
                    const next_str_start = last_h + 1;
                    pojo.context_list.push(this.convertToUtf8(buffer.subarray(now_str_start, next_str_start), pojo.encoding));
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
        // fs.closeSync(fd);
        await fd.close();
        return pojo;
    }


    async log_viewer(data: WsData<LogViewerPojo>) {
        const pojo = data.context as LogViewerPojo;
        pojo.context = "";
        pojo.context_list = [];
        pojo.context_position_list = [];
        pojo.context_start_position_list = [];
        const root_path = settingService.getFileRootPath(pojo.token);
        const file_path = path.join(root_path, decodeURIComponent(pojo.path));
        userService.check_user_path((data.wss as Wss).token, file_path)
        // 获取文件的元数据
        const stats = await FileUtil.statSync(file_path);
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
        userService.check_user_path(wss.token, file_path)
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
