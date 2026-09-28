import {
    base64UploadType,
    FileCompressPojo,
    FileCompressType, FileInfo,
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
import {cutCopyReq, file_share_item, fileInfoReq, ws_file_upload_req} from "../../../common/req/file.req";
import {formatFileSize} from "../../../common/ValueUtil";
import {settingService} from "../setting/setting.service";
import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {SysPojo} from "../../../common/req/sys.pojo";
import {RCode} from "../../../common/Result.pojo";
import {fileCompress, FileCompress} from "./file.compress";
import {get_bin_dependency} from "../bin/get_bin_dependency";
import {getFileFormat} from "../../../common/FileMenuType";
import {formatDate, formatPermissions, removeTrailingPath} from "../../../common/StringUtil";
import si from "systeminformation";
import multer from 'multer';
import {Request, Response} from "express";
import {userService} from "../user/user.service";
import {SysEnum, UserAuth} from "../../../common/req/user.req";
import {FileUtil} from "./FileUtil";
const {node_process_watcher} = get_bin_dependency("node-process-watcher",false);
import {list_paginate} from "../../../common/ListUtil";
import {isAbsolutePath} from "../../../common/path_util";
import {DataUtil} from "../data/DataUtil";
import {data_common_key, file_key} from "../data/data_type";
import {getSys} from "../shell/shell.service";
import {sqliteQueryReq, sqliteQueryResult} from "../../../common/req/file.req";
import {
    PathResolution,
    resolve_local_path,
    require_driver,
    assert_cap,
    to_frontend_item,
    join_frontend_path,
    stream_to_buffer,
    as_readable,
    current_mount_info,
    mounts_under,
    is_mounted,
    is_dir_item,
    assert_not_mount_root,
} from "./mount_adapter";
import {FileItemData} from "../../../common/file.pojo";
import {pipeline} from "stream/promises";

const archiver = require('archiver');
const mime = require('mime-types');
const Database = get_bin_dependency("better-sqlite3", false) as any;

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

export class FileService  {

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

    public async get_file_base_info(token:string,param_path:string):Promise<FileInfo> {
        let sysPath = decodeURIComponent(param_path)
        const root_path = settingService.getFileRootPath(token);
        if(isAbsolutePath(sysPath)) {

        } else {
            sysPath = path.join(root_path, sysPath);
        }
        userService.check_user_path(token, sysPath)
        const stat = await FileUtil.statSync(sysPath);
        return {
            name:  path.basename(sysPath),
            path: sysPath,
            size: stat.size,
            isFile: stat.isFile(),
            isSymbolicLink: stat.isSymbolicLink(),
            createdAt: stat.birthtime?.getTime(),
            modifiedAt: stat.mtime?.getTime(),
            accessedAt: stat.atime?.getTime(),
            mode: stat.mode,
            uid: stat.uid,
            uname: getSys() === SysEnum.win ?node_process_watcher?.get_file_owner(sysPath)?.username:node_process_watcher?.get_username_by_uid(stat.uid)
        };
    }

    private resolveFilePath(token: string, param_path: string) {
        let sysPath = decodeURIComponent(param_path);
        const root_path = settingService.getFileRootPath(token);
        if (!isAbsolutePath(sysPath)) {
            sysPath = path.join(root_path, sysPath);
        }
        userService.check_user_path(token, sysPath);
        return sysPath;
    }

    /**
     * 取当前目录所在挂载的信息（用于文件列表顶部提示）。
     * 未挂载时返回 null，前端不显示提示条。
     */
    public async mount_info(token: string, param_path: string) {
        const sysPath = this.resolveFilePath(token, param_path ?? "");
        return Sucess(current_mount_info(sysPath));
    }

    private normalizeSqliteValue(value: any): any {
        if (typeof value === "bigint") {
            return value.toString();
        }
        if (Array.isArray(value)) {
            return value.map(v => this.normalizeSqliteValue(v));
        }
        if (value && typeof value === "object") {
            if (Buffer.isBuffer(value)) {
                return value;
            }
            const result: any = {};
            for (const [key, item] of Object.entries(value)) {
                result[key] = this.normalizeSqliteValue(item);
            }
            return result;
        }
        return value;
    }

    public async sqlite_query(token: string, data: sqliteQueryReq): Promise<Result<sqliteQueryResult | string>> {
        if (typeof Database !== "function") {
            return Fail("sqlite3 依赖未加载", RCode.Fail);
        }
        if (!data?.path || !data?.sql) {
            return Fail("path 或 sql 不能为空", RCode.Fail);
        }
        const sysPath = this.resolveFilePath(token, data.path);
        if (!await FileUtil.access(sysPath)) {
            return Fail("数据库文件不存在", RCode.Fail);
        }
        const stats = await FileUtil.statSync(sysPath);
        if (!stats.isFile()) {
            return Fail("请选择一个数据库文件", RCode.Fail);
        }
        const sql = data.sql.trim().replace(/;+\s*$/, "");
        // 允许任意语句（查询 + DDL/DML/维护命令），数据库以可写模式打开
        let db;
        try {
            db = new Database(sysPath, {fileMustExist: true});
            // 查询类语句：prepare 单条语句并返回结果集
            if (/^(select|with|pragma|explain)\b/i.test(sql)) {
                const stmt = db.prepare(sql);
                const rows = stmt.all().map(v => this.normalizeSqliteValue(v));
                let columns: string[] = [];
                try {
                    columns = stmt.columns().map(v => v.name);
                } catch (e) {
                    columns = [];
                }
                if (!columns.length && rows.length) {
                    columns = Object.keys(rows[0]);
                }
                const result: sqliteQueryResult = {
                    columns,
                    rows,
                    row_count: rows.length,
                };
                return Sucess(result);
            }
            // 写类语句（CREATE/DROP/ALTER/INSERT/UPDATE/DELETE/VACUUM 等）：
            // 用 exec 执行，支持以分号分隔的多条语句，返回受影响行数
            const info = db.exec(sql);
            const changes = db.prepare("SELECT changes() AS changes").get();
            const result: sqliteQueryResult = {
                columns: ["changes"],
                rows: [{changes: changes?.changes ?? 0}],
                row_count: 1,
            };
            return Sucess(result);
        } catch (e) {
            return Fail(e?.message ?? `${e}`, RCode.Fail);
        } finally {
            try {
                db?.close?.();
            } catch (e) {
                // ignore close errors
            }
        }
    }

    public async getFile(param_path, token): Promise<Result<GetFilePojo | string>> {
        const result: GetFilePojo = {
            files: [],
            folders: []
        };
        const root_path = settingService.getFileRootPath(token);
        let sysPath = decodeURIComponent(param_path)
        if(isAbsolutePath(sysPath)) {

        } else {
            sysPath = path.join(root_path, sysPath);
        }
        // const sysPath = is_sys_path === 1 ? `${decodeURIComponent(param_path)}` : path.join(root_path, param_path ? decodeURIComponent(param_path) : "");
        userService.check_user_path(token, sysPath)

        // 挂载接管：该路径落在某个挂载点内时，全部读写转发给对应驱动，
        // 本地物理目录下的真实文件不再被读取
        const mount_res = resolve_local_path(sysPath);
        if (mount_res.match) {
            return this.getFile_from_mount(mount_res, param_path);
        }

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
            const pojo = Sucess(buffer.toString('utf8'), RCode.PreFile);
            pojo.message = name;
            return pojo;
        }

        const items = await FileUtil.readdirSync(sysPath);// 读取目录内容
        // 该目录下直接的挂载点（用于给这些文件夹打特殊标记）
        const mount_points = mounts_under(sysPath);
        for (const item of items) {
            const filePath = path.join(sysPath, item);
            // 获取文件或文件夹的元信息
            let stats: null | Stats = null;
            try {
                stats = await FileUtil.statSync(filePath);
            } catch (e) {
                continue
                // console.log("读取错误", e);
            }
            const mtime = stats ? new Date(stats.mtime).getTime() : 0;
            // 这个文件夹自身是挂载点：打上挂载标记，前端会用它显示特殊底色
            const mp = mount_points.get(path.resolve(filePath));
            const mount_fields = mp ? {
                mount: true,
                mount_driver: mp.driver,
                mount_color: mp.color,
                mount_readonly: mp.readonly,
            } : {};
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
                    path: param_path,
                    ...mount_fields
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

    /**
     * 挂载目录的「读目录 / 读文件」。
     * 与本地分支返回同样的结构，前端无需区分。
     */
    private async getFile_from_mount(res: PathResolution, param_path: string): Promise<Result<GetFilePojo | string>> {
        const {driver, inner_path, match} = require_driver(res.real_path);
        // 先判断是文件还是目录
        const info = await driver.stat(inner_path);
        if (!info) {
            return Fail("路径不存在", RCode.Fail);
        }
        if (info.type !== FileTypeEnum.folder) {
            // 单个文件：读内容返回（与本地分支一致，走 PreFile）
            const stream = await driver.read(inner_path);
            const buffer = await stream_to_buffer(stream);
            const pojo = Sucess(buffer.toString("utf8"), RCode.PreFile);
            pojo.message = info.name;
            return pojo;
        }

        // 目录：列子项
        // 注意：这里的子项本身不是「挂载点」，不能被标记为 mount，
        // 否则进入挂载目录后里面的每一项都会带挂载底色。
        const result: GetFilePojo = {files: [], folders: []};
        const items = await driver.list(inner_path);
        for (const item of items) {
            const full_path = join_frontend_path(param_path, item.name);
            const base: FileItemData = {
                ...item,
                path: full_path,
            };
            if (item.type === FileTypeEnum.folder) {
                result.folders?.push(base);
            } else {
                result.files?.push(base);
            }
        }
        return Sucess(result);
    }

    public async get_list(token: string, param_path:string, page_num:number, page_size:number, search?:string) {
        const result: GetFilePojo = {
            folders: [],
            files: []
        };
        const root_path = settingService.getFileRootPath(token);
        const sysPath = path.join(root_path, param_path ? decodeURIComponent(param_path) : "");
        userService.check_user_path(token, sysPath)

        // 挂载接管
        const mount_res = resolve_local_path(sysPath);
        if (mount_res.match) {
            return this.get_list_from_mount(mount_res, param_path, page_num, page_size, search);
        }

        let items = await FileUtil.readdirSync(sysPath);// 读取目录内容
        // 该目录下直接的挂载点（用于给这些文件夹打特殊标记）
        const mount_points = mounts_under(sysPath);
        // 如果传入了 search 参数，先按照名称过滤
        if (search && search.trim()) {
            const keyword = search.trim().toLowerCase();
            items = items.filter(item => item.toLowerCase().includes(keyword));
        }
        items = list_paginate(items, page_num,page_size).list;
        for (const item of items) {
            const filePath = path.join(sysPath, item);
            // 获取文件或文件夹的元信息
            let stats: null | Stats = null;
            try {
                stats = await FileUtil.statSync(filePath);
            } catch (e) {
                // console.log("读取错误", e);
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

            const pojo: FileItemData = {
                type,
                name: item,
                mtime: mtime,
                size,
                isLink: stats?.isSymbolicLink(),
                path: p
            }
            // 这个文件夹自身是挂载点：打上挂载标记，前端会用它显示特殊底色
            const mp = mount_points.get(path.resolve(filePath));
            if (mp) {
                pojo.mount = true;
                pojo.mount_driver = mp.driver;
                pojo.mount_color = mp.color;
                pojo.mount_readonly = mp.readonly;
            }
            result.files.push(pojo)
        }
        return Sucess(result);
    }

    /**
     * 挂载目录的分页列表。
     * 网盘一般没有服务端分页，统一在本地做（拉回列表后切片），并对 search 做前端过滤。
     */
    private async get_list_from_mount(
        res: PathResolution,
        param_path: string,
        page_num: number,
        page_size: number,
        search?: string
    ): Promise<Result<GetFilePojo>> {
        const {driver, inner_path, match} = require_driver(res.real_path);
        const result: GetFilePojo = {folders: [], files: []};
        let items = await driver.list(inner_path);
        // 搜索过滤
        if (search && search.trim()) {
            const keyword = search.trim().toLowerCase();
            items = items.filter(item => item.name.toLowerCase().includes(keyword));
        }
        // 统一按名称排序，保证分页结果稳定
        items = items.slice().sort((a, b) => a.name.localeCompare(b.name));
        items = list_paginate(items, page_num, page_size).list;
        for (const item of items) {
            const pojo: FileItemData = {
                ...item,
                path: join_frontend_path(param_path, item.name),
                mount: true,
                mount_driver: match.mount.driver,
                mount_color: match.mount.color,
                mount_readonly: match.mount.readonly,
            };
            result.files.push(pojo);
        }
        return Sucess(result);
    }

    // folder_size_info:Map<string,{num:number,size:number}> = new Map();
    public async get_folder_info(fpath: string, token, wss: Wss) {
        const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(fpath));
        userService.check_user_path(token, sysPath);
        node_process_watcher?.on_folder_size(sysPath, (file_num: number, total_size: number) => {
            wss.send(CmdType.folder_size_info, [file_num, total_size]);
        });
        wss.setClose(() => {
            node_process_watcher?.stop_folder_size(sysPath);
        })
    }

    public async stop_folder_info(fpath: string, token) {
        const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(fpath));
        userService.check_user_path(token, sysPath);
        node_process_watcher?.stop_folder_size(sysPath);
    }

    public async getFileInfo(type: FileTypeEnum, fpath: string, token, wss?: Wss) {
        let info: FileInfoItemData = {};
        const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(fpath));
        userService.check_user_path(token, sysPath)
        switch (type) {
            case FileTypeEnum.folder:
                // 挂载目录：显示网盘容量（如果驱动能查），而不是本地磁盘容量
                const mount_res = resolve_local_path(sysPath);
                if (mount_res.match) {
                    const q = await require_driver(mount_res.real_path).driver.quota().catch(() => null);
                    if (q) {
                        info.total_size = q.total;
                        info.used_size = q.used;
                        info.left_size = q.total - q.used;
                    }
                    // 无论能不能查容量，都标记为挂载，让前端展示挂载标识
                    info.mount = true;
                    info.mount_driver = mount_res.match.mount.driver;
                    info.mount_color = mount_res.match.mount.color;
                    info.now_absolute_path = sysPath;
                    return info;
                }
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

    /**
     * 挂载场景专用的上传中间件。
     * 本地上传用的是 diskStorage（先落盘再搬），但挂载目标是网盘，
     * 必须先落盘再上传就违背了「不落服务器磁盘」的原则，
     * 所以这里用内存存储：文件只在内存里过一遍就直接流转给网盘。
     */
    upload_mount = multer({
        storage: multer.memoryStorage(),
        // 内存方式对大文件不友好，限制单个文件 512MB
        limits: {fileSize: 512 * 1024 * 1024},
    }).single('file');

    public async uploadFile(filePath, req: Request, res: Response, token) {

        const sysPath = path.join(settingService.getFileRootPath(token), filePath ? decodeURIComponent(filePath) : "");
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);

        // 挂载接管：目标落在挂载点内时，走内存上传 + 流转给驱动
        const mount_res = resolve_local_path(sysPath);
        if (mount_res.match) {
            return this.upload_to_mount(mount_res, req, res);
        }

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

    /**
     * 上传到挂载目录。
     * 用内存存储接收整个文件，再以流的形式写给驱动（不落服务器磁盘）。
     */
    private upload_to_mount(mount_diff: PathResolution, req: Request, res: Response): Promise<any> {
        const mnt_r = require_driver(mount_diff.real_path);
        assert_cap(mnt_r.driver, "write", "上传文件", mount_diff.match);
        return new Promise((resolve) => {
            this.upload_mount(req, res, async (err: any) => {
                if (err) {
                    console.log("挂载上传失败：", err);
                    resolve(Fail(err?.message ?? "上传失败"));
                    return;
                }
                try {
                    const file = (req as any).file;
                    if (!file) {
                        // 仅创建目录（前端 dir=1）
                        if (req.query.dir === "1") {
                            await mnt_r.driver.mkdir(mnt_r.inner_path);
                            resolve(Sucess(true));
                            return;
                        }
                        resolve(Fail("未接收到文件"));
                        return;
                    }
                    const {Readable} = require("stream");
                    await mnt_r.driver.write(mnt_r.inner_path, Readable.from([file.buffer]), file.size);
                    resolve(Sucess(true));
                } catch (e) {
                    console.log("挂载写入失败：", e);
                    resolve(Fail(e?.message ?? "写入失败"));
                }
            });
        });
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

        // 挂载接管：分片在内存里累积，最后一片完成时一次性写给驱动
        const mount_res = resolve_local_path(sysPath);
        if (mount_res.match) {
            const r = require_driver(mount_res.real_path);
            if (param.is_dir) {
                assert_cap(r.driver, "mkdir", "新建目录", mount_res.match);
                await r.driver.mkdir(r.inner_path);
                return;
            }
            assert_cap(r.driver, "write", "上传文件", mount_res.match);
            this.mount_upload_map.set(sysPath, {
                driver: r.driver,
                inner_path: r.inner_path,
                buffer_list: new Array(param.parallel_done_num).fill(undefined),
                parallel_done_num: 0,
                total_size: 0,
                lastModified: param.lastModified,
                chunks: [],
            });
            return;
        }

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
        fileCompress.lifeStart(sysPath, upload_max_key, async (key) => {
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
        fileCompress.lifeHeart(sysPath);

        // 挂载接管：分片累积在内存，最后一片完成时一次写给驱动
        const mount_upload = this.mount_upload_map.get(sysPath);
        if (mount_upload) {
            await this.mount_file_upload(sysPath, mount_upload, param, data);
            return;
        }

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

    /**
     * 挂载场景的分片上传状态（按目标路径索引）。
     * 与 file_upload_count_map 分开维护：那里绑定的是本地写流，
     * 挂载场景只需要攒分片、最后一次写出去。
     */
    mount_upload_map = new Map<string, {
        driver: any,
        inner_path: string,
        buffer_list: Uint8Array[],
        parallel_done_num: number,
        total_size: number,
        lastModified: number,
        /** 已累积的分片（整包用完即释放） */
        chunks: Buffer[],
    }>();

    /**
     * 处理挂载目标的一个上传分片。
     * 同一批并行分片（parallel_done_num 个）都到齐后才累积一次，
     * 全部分片收完后一次性作为流写给驱动 —— 数据全程在内存，不落服务器磁盘。
     */
    private async mount_file_upload(
        sysPath: string,
        state: {
            driver: any;
            inner_path: string;
            buffer_list: Uint8Array[];
            parallel_done_num: number;
            total_size: number;
            chunks: Buffer[];
        },
        param: ws_file_upload_req,
        data: WsData<ws_file_upload_req>
    ): Promise<void> {
        try {
            state.buffer_list[param.part_count] = data.bin_context;
            delete data.bin_context;
            state.parallel_done_num++;
            if (state.parallel_done_num !== param.parallel_done_num) {
                return;
            }
            state.parallel_done_num = 0;
            // 累积这批分片
            for (const chunk of state.buffer_list) {
                if (chunk) {
                    state.total_size += chunk.length;
                    state.chunks.push(Buffer.from(chunk));
                }
            }
            state.buffer_list = new Array(param.parallel_done_num).fill(undefined);

            // 最后一片：一次性写给驱动
            if (param.chunk_index === param.total_chunk_index - 1) {
                this.mount_upload_map.delete(sysPath);
                const full = Buffer.concat(state.chunks);
                state.chunks.length = 0;
                const {Readable} = require("stream");
                await state.driver.write(state.inner_path, Readable.from([full]), full.length);
            }
        } catch (e) {
            this.mount_upload_map.delete(sysPath);
            state.chunks.length = 0;
            console.log("挂载分片上传失败：", e);
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

        // 挂载接管：网盘没有回收站概念，直接调驱动的删除
        const mount_res = resolve_local_path(sysPath);
        if (mount_res.match) {
            // 删挂载点本身等于清空整个网盘，先拦截
            assert_not_mount_root(mount_res.match, "删除");
            const r = require_driver(mount_res.real_path);
            assert_cap(r.driver, "remove", "删除", mount_res.match);
            await r.driver.remove(r.inner_path);
            return Sucess("1");
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

    public async save(token, context?: string, filePath?: string) {
        if (context === null || context === undefined) {
            return;
        }
        let sysPath = decodeURIComponent(filePath)
        if(path.isAbsolute(sysPath)) {

        } else {
            sysPath = path.join(settingService.getFileRootPath(token), sysPath);
        }
        userService.check_user_path(token, sysPath);
        userService.check_user_only_path(token, sysPath);

        // 挂载接管：流式写回网盘（不落服务器磁盘）
        const mount_res = resolve_local_path(sysPath);
        if (mount_res.match) {
            const r = require_driver(mount_res.real_path);
            assert_cap(r.driver, "write", "保存文件", mount_res.match);
            const {Readable} = require("stream");
            const buf = Buffer.from(context, "utf8");
            await r.driver.write(r.inner_path, Readable.from([buf]), buf.length);
            return;
        }

        // const sysPath = path.join(settingService.getFileRootPath(token),filePath?decodeURIComponent(filePath):"");
        // 写入文件
        await FileUtil.writeFileSync(sysPath, context, {
            encoding: 'utf8'
        });
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
            const src = decodeURIComponent(path.join(sysPath, file));
            const dst = decodeURIComponent(path.join(toSysPath, path.basename(file)));
            // 挂载接管：源在挂载内，或目标在挂载内，都用驱动处理
            const src_mount = resolve_local_path(src);
            const dst_mount = resolve_local_path(dst);
            if (src_mount.match || dst_mount.match) {
                await this.mount_move_copy(src, dst, "move");
                continue;
            }
            await this.cut_exec(src, dst)
        }
    }

    /**
     * 挂载场景下的移动/复制。
     * 支持三种组合：同挂载内、本地→挂载、挂载→本地。
     * 跨「挂载」的移动用「读 + 写」流转（不落服务器磁盘）。
     */
    private async mount_move_copy(src: string, dst: string, mode: "move" | "copy"): Promise<void> {
        const src_mount = resolve_local_path(src);
        const dst_mount = resolve_local_path(dst);
        const {Readable} = require("stream");

        // 同挂载内：交给驱动自己的 move/copy
        if (src_mount.match && dst_mount.match
            && src_mount.match.mount.id === dst_mount.match.mount.id) {
            // 移动挂载点本身相当于搬走网盘根目录，先拦截（复制不破坏源，允许）
            if (mode === "move") {
                assert_not_mount_root(src_mount.match, "移动");
            }
            const r = require_driver(src);
            const action = mode === "move" ? "移动" : "复制";
            assert_cap(r.driver, mode, action, src_mount.match);
            if (mode === "move") {
                await r.driver.move(src_mount.inner_path, dst_mount.inner_path);
            } else {
                await r.driver.copy(src_mount.inner_path, dst_mount.inner_path);
            }
            return;
        }

        // 跨挂载/跨本地：用「读源 + 写目标」流转
        if (src_mount.match) {
            if (mode === "move") {
                assert_not_mount_root(src_mount.match, "移动");
            }
            if (src_mount.match.mount.readonly) {
                throw new Error("源挂载为只读模式，无法移出文件");
            }
        }
        if (dst_mount.match) {
            const target_driver = require_driver(dst).driver;
            assert_cap(target_driver, "write", mode === "move" ? "移动" : "复制", dst_mount.match);
        }

        // 取出源信息，判断是文件还是目录
        const src_info = src_mount.match
            ? await require_driver(src).driver.stat(src_mount.inner_path)
            : await FileUtil.statSync(src).then(s => ({type: s.isDirectory() ? FileTypeEnum.folder : FileTypeEnum.blob, size: s.size}) as any);
        if (!src_info) {
            throw new Error("源路径不存在");
        }

        if (src_info.type === FileTypeEnum.folder) {
            // 目录：递归
            if (dst_mount.match) {
                await require_driver(dst).driver.mkdir(dst_mount.inner_path);
            } else {
                await fse.mkdirs(dst);
            }
            const children = src_mount.match
                ? await require_driver(src).driver.list(src_mount.inner_path)
                : await FileUtil.readdirSync(src).then(names => names.map(n => ({name: n})) as any[]);
            for (const c of children) {
                await this.mount_move_copy(path.posix.join(src, c.name), path.posix.join(dst, c.name), mode);
            }
        } else {
            // 文件：读源 → 写目标
            const rs = src_mount.match
                ? await require_driver(src).driver.read(src_mount.inner_path)
                : fs.createReadStream(src);
            if (dst_mount.match) {
                await require_driver(dst).driver.write(dst_mount.inner_path, as_readable(rs), src_info.size);
            } else {
                await fse.ensureDir(path.dirname(dst));
                // 本地目标：直接写入
                await pipeline(as_readable(rs), fs.createWriteStream(dst));            }
        }

        // 移动语义：最后删掉源
        if (mode === "move") {
            if (src_mount.match) {
                await require_driver(src).driver.remove(src_mount.inner_path);
            } else {
                await rimraf(src);
            }
        }
    }

    /**
     * 判断两个路径是否位于同一个文件系统（同一设备/硬盘）。
     * 跨盘的 renameSync 会报 EXDEV 错误，因此需要提前判断，跨盘时改用"复制+删除"实现移动。
     * 通过比较路径所在设备的 dev（设备号）来判断，适用于 Linux/macOS/Windows。
     * @param p1 已存在的源路径
     * @param p2 已存在的路径（这里传目标文件的父目录）
     */
    private async isSameFileSystem(p1: string, p2: string): Promise<boolean> {
        try {
            const [s1, s2] = await Promise.all([FileUtil.statSync(p1), FileUtil.statSync(p2)]);
            return s1.dev === s2.dev;
        } catch (e) {
            // 无法获取 stat 时保守地允许尝试 rename（交给 renameSync 自行抛 EXDEV 处理）
            return true;
        }
    }

    public async cut_exec(source_path: string, to_file: string) {
        // 先判断源与目标是否在同一个硬盘；不同盘 renameSync 会因 EXDEV 失败，需改用复制+删除
        const sameFs = await this.isSameFileSystem(source_path, path.dirname(to_file));
        if (sameFs) {
            await FileUtil.renameSync(source_path, to_file);
            await rimraf(source_path);
        } else {
            // 跨盘移动：复制到目标后删除源
            await fse.copy(source_path, to_file, {overwrite: true});
            await rimraf(source_path);
        }
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
            const target = decodeURIComponent(path.join(toSysPath, path.basename(file)));
            // 挂载接管
            if (resolve_local_path(filePath).match || resolve_local_path(target).match) {
                await this.mount_move_copy(filePath, target, "copy");
                continue;
            }
            // 覆盖
            await fse.copy(filePath, target, {overwrite: true});
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

        // 挂载接管
        const mount_res = resolve_local_path(sysPath);
        if (mount_res.match) {
            const r = require_driver(mount_res.real_path);
            if (type === 1) {
                assert_cap(r.driver, "mkdir", "新建目录", mount_res.match);
                await r.driver.mkdir(r.inner_path);
            } else {
                assert_cap(r.driver, "write", "新建文件", mount_res.match);
                const {Readable} = require("stream");
                const buf = Buffer.from(data.context ?? "", "utf8");
                await r.driver.write(r.inner_path, Readable.from([buf]), buf.length);
            }
            return;
        }

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

        // 挂载接管
        const mount_res = resolve_local_path(sysPath);
        if (mount_res.match) {
            // 重命名挂载点本身等于给网盘根目录改名，会影响所有挂载使用，先拦截
            assert_not_mount_root(mount_res.match, "重命名");
            const r = require_driver(mount_res.real_path);
            assert_cap(r.driver, "move", "重命名", mount_res.match);
            // 目标也在同一个挂载内（前端只改名字，不跨挂载）
            const target = resolve_local_path(sysPathNew);
            if (!target.match) {
                throw new Error("不能把挂载内的文件移动到挂载目录之外");
            }
            await r.driver.move(r.inner_path, target.inner_path);
            return;
        }

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

    /**
     * 挂载文件的下载。
     * 优先用驱动给的直链做 302 跳转（浏览器直连网盘，完全不占服务器带宽）；
     * 拿不到直链的（WebDAV/百度等）走服务器中转，用流边读边发。
     */
    private async download_from_mount(
        mount_diff: PathResolution,
        sysPath: string,
        range: string | undefined,
        res: Response,
        opts: {cache: boolean; show: boolean}
    ): Promise<void> {
        const mnt_r = require_driver(mount_diff.real_path);
        const info = await mnt_r.driver.stat(mnt_r.inner_path);
        if (!info) {
            res.status(404).send("File not found");
            return;
        }
        if (info.type === FileTypeEnum.folder) {
            // 网盘目录无法打包下载（需要全部拉到服务器再压缩，违背不落盘原则）
            res.status(400).send("挂载目录不支持打包下载，请进入目录后选择文件下载");
            return;
        }
        const file_name = info.name;
        const encodedFileName = encodeURIComponent(file_name).replace(/%20/g, "+");
        const handle_type = opts.show ? "inline" : "attachment";

        // 只有不带 Range 时才用直链（带 Range 的播放器请求交给中转流更可靠）
        if (!range) {
            const direct = await mnt_r.driver.getDirectUrl(mnt_r.inner_path);
            if (direct) {
                // 直链有效期短，不让浏览器缓存跳转结果
                res.setHeader("Cache-Control", "no-store");
                res.redirect(302, direct);
                return;
            }
        }

        // 服务器中转
        const total = info.size ?? 0;
        const headers: Record<string, string | number> = {
            "Content-Type": mime.lookup(file_name) || "application/octet-stream",
            "Accept-Ranges": "bytes",
            "Content-Disposition": `${handle_type}; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`,
        };
        if (opts.cache) {
            headers["Cache-Control"] = "public, max-age=86400";
        }

        let stream;
        if (range && total > 0) {
            const [start_s, end_s] = range.replace(/bytes=/, "").split("-");
            const start = parseInt(start_s, 10);
            const end = end_s ? parseInt(end_s, 10) : total - 1;
            if (Number.isNaN(start) || start >= total) {
                res.status(416).send("Requested range not satisfiable");
                return;
            }
            stream = await mnt_r.driver.read(mnt_r.inner_path, [start, end]);
            res.status(206);
            headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
            headers["Content-Length"] = end - start + 1;
        } else {
            stream = await mnt_r.driver.read(mnt_r.inner_path);
            if (total > 0) {
                headers["Content-Length"] = total;
            }
        }
        res.set(headers);
        as_readable(stream).pipe(res);
    }

    async download_for_private(ctx) {
        let file = ctx.query.file;
        if (!file || !file.length) {
            ctx.res.status(404).send('File not found');
            return;
        }
        const token = ctx.query['token'];
        const cache = ctx.query['cache'];
        const show = ctx.query['show'];
        const range = ctx.header("Range");
        const res = ctx.res
        if (!Array.isArray(file)) {
            const p = decodeURIComponent(file);
            if(isAbsolutePath(p)) {
                file = p;
            } else {
                file  = path.join(settingService.getFileRootPath(token), decodeURIComponent(file));
            }
            userService.check_user_path(token, file)
        } else {
            const files: string [] = file;
            const new_files = []
            for (const file of files) {
                let sysPath = decodeURIComponent(file);
                if(isAbsolutePath(sysPath)) {

                } else {
                    sysPath  = path.join(settingService.getFileRootPath(token), sysPath);
                }
                // const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(file));
                userService.check_user_path(token, sysPath)
                new_files.push(sysPath);
            }
            file = new_files
        }
        this.download({file,token,cache,show,range,res})
    }

    async download_for_public(ctx) {
        const file = ctx.query.file;
        if (!file || !file.length) {
            ctx.res.status(404).send('File not found');
            return;
        }
        // const token = ctx.query['token'];
        const cache = ctx.query['cache'];
        const show = ctx.query['show'];
        const range = ctx.header("Range");
        const res = ctx.res

        const share_id = ctx.query['share_id'];
        const share_token = ctx.query['share_token'];

        const list = settingService.get_share_file_list();
        let item: file_share_item;
        for (const i of list) {
            if (i.id === share_id) {
                const statics: {} = DataUtil.get(data_common_key.share_file_list_key_download_statics, file_key.statics_tag) ?? {}
                statics[i.id] = (statics[i.id] ?? 0) + 1
                DataUtil.set(data_common_key.share_file_list_key_download_statics, statics, file_key.statics_tag);
                item = i;
                break
            }
        }
        if (!item) {
            res.status(400).send("未知分享");
            return;
        }
        if(item.token) {
            if(item.token !== share_token) {
                res.status(400).send("token错误");
                return;
            }
        }
        this.download({file,cache,show,range,res})
    }

    private async download({file,cache,show,range,res}:any) {
        // const file = ctx.query.file;
        // if (!file || !file.length) {
        //     ctx.res.status(404).send('File not found');
        //     return;
        // }
        // const token = ctx.query['token'];
        // const cache = ctx.query['cache'];
        // const show = ctx.query['show'];
        if (!Array.isArray(file)) {
            // 单个文件
            // const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(file));
            const sysPath = decodeURIComponent(file);

            // 挂载接管
            const mount_res = resolve_local_path(sysPath);
            if (mount_res.match) {
                return this.download_from_mount(mount_res, sysPath, range, res, {
                    cache: cache === "1",
                    show: show === "1",
                });
            }

            const fileName = path.basename(sysPath)
            const stats = await FileUtil.statSync(sysPath);
            // const range = ctx.header("Range");
            const fileSize = stats.size;
            if (range) {
                const encodedFileName = encodeURIComponent(fileName).replace(/%20/g, '+');
                const [start, end] = range.replace(/bytes=/, "").split("-");
                const startByte = parseInt(start, 10);
                const endByte = end ? parseInt(end, 10) : fileSize - 1;
                if (startByte >= fileSize) {
                    res.status(416).send("Requested range not satisfiable");
                    return;
                }
                const chunkSize = endByte - startByte + 1;
                const readStream = fs.createReadStream(sysPath, {start: startByte, end: endByte});
                res.status(206);
                res.set({
                    "Content-Range": `bytes ${startByte}-${endByte}/${fileSize}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunkSize,
                    "Content-Type": mime.lookup(fileName) || "application/octet-stream",
                    "Content-Disposition": `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
                });
                readStream.pipe(res);
                return;
            }
            if (stats.isFile()) {
                this.download_one_file(fileName, fileSize, sysPath, res, {
                    cache: cache === "1",
                    handle_type_: show === "1" ? "inline" : "attachment"
                });
                // ctx.res.body = fs.createReadStream(sysPath);
            } else {
                res.attachment(path.basename(sysPath) + ".zip");
                const archive = archiver('zip', {zlib: {level: 5}});
                archive.pipe(res);
                archive.directory(sysPath, path.basename(sysPath));
                archive.finalize();
            }

        } else {
            const files: string [] = file;
            const archive = archiver('zip', {
                zlib: {level: 5} // 设置压缩级别
            });
            res.attachment("output.zip");
            res.set('Content-Type', 'application/octet-stream');
            // ctx.set('Content-Type', 'application/zip');
            // ctx.set('Content-Disposition', 'attachment; filename=output.zip');
            // const stream = new Stream.PassThrough()
            // ctx.res.body = stream
            // 将压缩后的文件流发送给客户端
            archive.pipe(res)
            for (const file of files) {
                // const sysPath = path.join(settingService.getFileRootPath(token), decodeURIComponent(file));
                const sysPath = decodeURIComponent(file);
                // 挂载内的文件无法直接用 archiver 打包（archiver 只认本地路径），
                // 需要先下到服务器再压，违背「不落盘」原则，因此直接拒绝
                if (resolve_local_path(sysPath).match) {
                    archive.abort();
                    res.status(400).send("挂载目录中的文件不支持打包下载，请单个下载");
                    return;
                }
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


    async file_video_trans(data: WsData<FileVideoFormatTransPojo>) {
        const pojo = data.context as FileVideoFormatTransPojo;
        userService.have_user_auth(pojo.token, UserAuth.filecat_file_context_update_upload_created_copy_decompression);
        const wss = data.wss as Wss;
        const root_path = settingService.getFileRootPath(pojo.token);
        const sysPath = path.join(root_path, decodeURIComponent(pojo.source_filename));
        const sysPathNew = path.join(root_path, decodeURIComponent(pojo.to_filename));


        (await settingService.getFfmpeg())(sysPath)
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
        userService.have_user_auth(pojo.token, UserAuth.filecat_file_context_update_upload_created_copy_decompression);

        const source_file = decodeURIComponent(pojo.source_file);
        const tar_dir = decodeURIComponent(pojo.tar_dir ?? "");
        const directoryPath = decodeURIComponent(path.dirname(source_file));
        const root_path = settingService.getFileRootPath(pojo.token);
        const targetFolder = path.join(root_path, directoryPath, tar_dir);
        userService.check_user_path(pojo.token, targetFolder);
        userService.check_user_only_path(pojo.token, targetFolder);

        // 挂载接管：解压必须先把文件拉到服务器磁盘才能解，违背「不落盘」原则，直接拒绝
        const sysSourcePathCheck = path.join(root_path, source_file);
        if (resolve_local_path(sysSourcePathCheck).match || resolve_local_path(targetFolder).match) {
            throw new Error("挂载目录不支持解压，请先将文件下载到本地目录");
        }

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
        await fileCompress.handle_un(pojo.format,sysSourcePath,targetFolder,outHanle)
    }

    async FileCompress(data: WsData<FileCompressPojo>) {
        const pojo = data.context as FileCompressPojo;
        userService.have_user_auth(pojo.token, UserAuth.filecat_file_context_update_upload_created_copy_decompression);

        const files = pojo.filePaths;
        const root_path = settingService.getFileRootPath(pojo.token);
        const wss = data.wss as Wss;
        const filePaths: string[] = [], directorys: string[] = [];
        for (const file of files) {
            const name = path.join(root_path, decodeURIComponent(file));
            userService.check_user_path(pojo.token, name);
            userService.check_user_only_path(pojo.token, name);
            // 挂载内的内容无法直接压缩（要先拉到服务器磁盘），直接拒绝
            if (resolve_local_path(name).match) {
                throw new Error("挂载目录不支持压缩，请先将文件下载到本地目录");
            }
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
        const targerFilePath = path.join(root_path, decodeURIComponent(pojo.tar_filename));
        const handle_progress = (value)=>{
            {
                if (value === -1) {
                    wss.ws.close();
                    return;
                }
                const result = new WsData<SysPojo>(CmdType.file_compress_progress);
                result.context = value;
                wss.sendData(result.encode());
            }
        }
        let format:"tar"|"zip";
        switch (pojo.format) {
            case FileCompressType.tar:
                format = "tar";
                break;
            case FileCompressType.gz:
                await fileCompress.compressGz(pojo.compress_level,targerFilePath,filePaths,directorys,handle_progress)
                return
            case FileCompressType.rar:
                // 不支持
                return
            case FileCompressType.zip:
                format = "zip";
                break
            case FileCompressType.tar_gz:
                format = "tar";
                break
        }
        await fileCompress.compress(format, pojo.compress_level, targerFilePath, filePaths, directorys, handle_progress, pojo.format === FileCompressType.tar_gz);
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

        // 挂载接管
        const mount_res = resolve_local_path(sysPath);
        if (mount_res.match) {
            const mnt_r = require_driver(mount_res.real_path);
            const info = await mnt_r.driver.stat(mnt_r.inner_path);
            if (!info) {
                return Fail("路径不存在", RCode.Fail);
            }
            if (info.type !== FileTypeEnum.folder) {
                return Fail("是文件", RCode.Fail);
            }
            const items = await mnt_r.driver.list(mnt_r.inner_path);
            for (const item of items) {
                result.list.push({
                    type: item.type === FileTypeEnum.folder ? "folder" : "file",
                    name: item.name,
                    size: item.size,
                });
            }
            return result;
        }

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
        if (pojo.find_back_enter_index) await this.find_back_enter_index(pojo, file_path, 100);
        return this.go_forward_log(pojo, file_path);
    }

    file_change_watcher_map = new Map<string,string>();


    log_viewer_watch_cancel(data: WsData<LogViewerPojo>) {
        this.file_change_watcher_map.delete(data.wss.token)
    }

    // todo 多个文件复用同一个文件监听 做一个通用的函数 事件推送的形式
    log_viewer_watch(data: WsData<LogViewerPojo>) {
        const pojo = data.context as LogViewerPojo;
        if (this.file_change_watcher_map.has(data.wss.token)) {
            return;
        }

        const wss = data.wss as Wss;
        pojo.context = "";
        pojo.context_list = [];
        pojo.context_position_list = [];
        pojo.context_start_position_list = [];
        const root_path = settingService.getFileRootPath(data.wss.token);
        const file_path = path.join(root_path, decodeURIComponent(pojo.path));
        userService.check_user_path(wss.token, file_path)
        // 使用 chokidar 监控文件变化
        let watcher = chokidar.watch(file_path, {
            persistent: true,  // 持续监听
            usePolling: true, // 使用事件驱动模式（默认是）
            // interval: 100,     // 轮询间隔（如果启用了轮询模式）
        });
        this.file_change_watcher_map.set(data.wss.token, watcher);
        wss.setClose(() => {
            watcher.close();
            this.file_change_watcher_map.delete(data.wss.token);
        })
        // 已读取的字节数
        let bytesRead = pojo.max_size;
        // 监听文件变化事件
        watcher.on('change', (changedFilePath) => {
            if (changedFilePath === file_path) {
                if(!this.file_change_watcher_map.has(data.wss.token)) {
                    watcher.close();
                    return;
                }
                // 获取当前文件的状态
                fs.stat(file_path, (err, stats) => {
                    if (err) {
                        console.error('Failed to get file stats:', err);
                        watcher.close();
                        this.file_change_watcher_map.delete(data.wss.token);
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
            this.file_change_watcher_map.delete(data.wss.token);
        });
    }

    public async get_share_info(id:string,token:string) {
        const list = settingService.get_share_file_list();
        let item: file_share_item;
        for (const i of list) {
            if (i.id === id) {
                item = i;
                break
            }
        }
        if (!item) throw "未知分享"
        if (item.token) {
            if (token !== item.token) {
                return Sucess("", RCode.need_token_share)
            }
        }
        const result = {
            is_dir: true,
            files: []
        }
        const sysPath = decodeURIComponent(item.path)
        // 分享路径可能位于网盘挂载目录里，统一交给适配层判断走本地还是走驱动
        if (is_mounted(sysPath)) {
            const {driver, inner_path, match} = require_driver(sysPath)
            const st = await driver.stat(inner_path)
            if (!st) throw "分享的文件不存在"
            // 挂载项统一打上挂载标记，前端据此识别（分享页与文件页表现一致）
            const mount_mark = {
                mount: true,
                mount_driver: match.mount.driver,
                mount_color: match.mount.color,
                mount_readonly: match.mount.readonly,
            }
            if (is_dir_item(st)) {
                // 目录：只列出文件，子目录不参与分享下载
                const items = await driver.list(inner_path)
                for (const it of items) {
                    if (is_dir_item(it)) continue
                    result.files.push({
                        ...it,
                        path: join_frontend_path(item.path, it.name),
                        ...mount_mark,
                    })
                }
            } else {
                result.is_dir = false
                result.files.push({
                    ...st,
                    path: item.path,
                    ...mount_mark,
                })
            }
            return Sucess(result)
        }
        const stats = await FileUtil.statSync(item.path)
        if(stats.isFile()) {
            result.is_dir = false
            const mtime = stats ? new Date(stats.mtime).getTime() : 0;
            const name = path.basename(sysPath);
            const pojo = {
                type:getFileFormat(name),
                name: name,
                mtime: mtime,
                size: stats.size,
                isLink: stats?.isSymbolicLink(),
                path: sysPath
            }
            result.files.push(pojo)
        } else {
            let items = await FileUtil.readdirSync(sysPath);// 读取目录内容
            const param_path =item.path
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
                    continue;
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
        }
        return Sucess(result);
    }
}

export const FileServiceImpl = new FileService();
