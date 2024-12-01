import path from "path";
import {FileCompressType} from "../../../common/file.pojo";
import {loadWasm} from "../bin/bin";

const fs = require('fs');
const unzipper = require('unzipper');
const tar = require('tar');
const zlib = require('zlib');
const archiver = require('archiver');
const unrar = require("node-unrar-js");

export class FileCompress {

    unZip(filePath: string, targetFolder: string, progress: (value: number) => void) {
        const stat = fs.statSync(filePath);
        const totalSize = stat.size;
        let processedSize = 0;
        // 创建文件读取流
        const readStream = fs.createReadStream(filePath);
        const extractStream = unzipper.Extract({path: targetFolder});
        // 监听读取流的 data 事件来计算进度
        readStream.on('data', (chunk) => {
            processedSize += chunk.length;
            progress((processedSize / totalSize) * 100);
        });
        // 监听读取流的 end 事件
        readStream.on('end', () => {
            progress(100);
        });
        // 监听解压流的 error 事件
        extractStream.on('error', (err) => {
            progress(-1);
        });
        // 管道读取流到解压流
        readStream.pipe(extractStream);
    }

    unTar(filePath: string, targetFolder: string, progress: (value: number) => void, gzip: boolean = false) {
        const stat = fs.statSync(filePath);
        const totalSize = stat.size;
        let processedSize = 0;

        const readStream = fs.createReadStream(filePath);
        const extractStream = tar.x({
            cwd: targetFolder,
            gzip: gzip
        });
        readStream.on('data', (chunk) => {
            processedSize += chunk.length;
            progress((processedSize / totalSize) * 100);
        });
        readStream.on('end', () => {
            progress(100);
        });
        readStream.on('error', (err) => {
            progress(-1);
        });
        extractStream.on('error', (err) => {
            progress(-1);
        });
        readStream.pipe(extractStream);
    }

    async unRar(filePath: string, targetFolder: string, progress: (value: number) => void) {
        // Read the archive file into a typedArray
        const buf = Uint8Array.from(fs.readFileSync(filePath)).buffer;
        const opt = {data: buf}
        if (process.env.NODE_ENV === "production") {
            opt['wasmBinary'] = loadWasm();
        }
        const extractor = await unrar.createExtractorFromData(opt);
        //
        // const list = extractor.getFileList();
        // const listArcHeader = list.arcHeader; // archive header
        // const fileHeaders = [...list.fileHeaders]; // load the file headers
        const extracted = extractor.extract({});
        // extracted.arcHeader  : archive header
        const files = [...extracted.files]; //load the files
        const dirs = [];
        const file_list = [];
        for (const file of files) {
            if (file.fileHeader.flags.directory) {
                dirs.push(file);
            } else {
                file_list.push(file);
            }
        }
        let count = 0;
        progress(0);
        for (const file of dirs) {
            fs.mkdirSync(path.join(targetFolder, file.fileHeader.name), {recursive: true});
            count++;
            progress((count / files.length) * 100);
        }
        for (const file of file_list) {
            fs.writeFileSync(path.join(targetFolder, file.fileHeader.name), file.extraction)
            count++;
            progress((count / files.length) * 100);
        }
        progress(100);
    }

    // 压缩进度获取
    compress(format: FileCompressType, level: number, targerFilePath: string, filePaths: string[], directorys: string[], progress: (value: number) => void, gzip: boolean = false) {
        // 创建一个输出流以写入压缩文件
        const output = fs.createWriteStream(targerFilePath);
        const archive = archiver(format, {
            zlib: {level}, // 设置压缩级别
            gzip: gzip
        });
        progress(0);
        // 监听关闭事件，当所有数据已写入到文件时触发
        output.on('close', function () {
            progress(100);
        });
        // 监听归档流的 `progress` 事件
        archive.on('progress', (data) => {
            const {totalBytes, processedBytes} = data.fs;
            const percent = (processedBytes / totalBytes) * 100;
            progress(percent);
        });
        // 监听错误事件
        archive.on('error', function (err) {
            progress(-1);
        });
        // 将压缩流管道到文件输出流
        archive.pipe(output);
        // 添加文件到压缩包
        filePaths.forEach(filePath => {
            archive.file(filePath, {name: path.basename(filePath)});
        })
        directorys.forEach(dir => {
            archive.directory(dir, path.basename(dir));
        })
        archive.finalize();
    }


}
