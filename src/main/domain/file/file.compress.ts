import path from "path";
import {FileCompressType} from "../../../common/file.pojo";
import {loadWasm} from "../bin/bin";
import {LifecycleRecordService} from "../pre/lifeRecordService";
import {Gunzip, Gzip} from "minizlib";

const fs = require('fs');
// const unzipper = require('unzipper'); // 对于流会有损坏的问题
const unzip_stream = require('unzip-stream');
const tar = require('tar');
// const zlib = require('zlib');
const archiver = require('archiver');
const unrar = require("node-unrar-js");

export class FileCompress extends LifecycleRecordService{

    async unZip(
        filePath: string,
        targetFolder: string,
        progress: (value: number) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                fs.mkdirSync(targetFolder, { recursive: true });

                const readStream = fs.createReadStream(filePath);
                const extractStream = unzip_stream.Extract({ path: targetFolder });

                let finished = false;

                const done = () => {
                    if (!finished) {
                        finished = true;
                        progress(100);
                        resolve();
                    }
                };

                readStream.on("error", (err) => {
                    progress(-1);
                    reject(err);
                });

                extractStream.on("error", (err) => {
                    progress(-1);
                    reject(err);
                });

                extractStream.on("close", done);
                extractStream.on("end", done);

                readStream.pipe(extractStream);
            } catch (e) {
                progress(-1);
                reject(e);
            }
        });
    }

    async unTar(
        filePath: string,
        targetFolder: string,
        progress: (value: number) => void,
        gzip: boolean = false
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                fs.mkdirSync(targetFolder, { recursive: true });

                const readStream = fs.createReadStream(filePath);

                const extractStream = tar.x({
                    cwd: targetFolder,
                    gzip
                });

                let finished = false;

                const done = () => {
                    if (!finished) {
                        finished = true;
                        progress(100);
                        resolve();
                    }
                };

                readStream.on("error", (err) => {
                    progress(-1);
                    reject(err);
                });

                extractStream.on("error", (err) => {
                    progress(-1);
                    reject(err);
                });

                extractStream.on("close", done);
                extractStream.on("end", done);

                readStream.pipe(extractStream);
            } catch (e) {
                progress(-1);
                reject(e);
            }
        });
    }

    async unRar(
        filePath: string,
        targetFolder: string,
        progress: (value: number) => void
    ): Promise<void> {
        try {
            fs.mkdirSync(targetFolder, { recursive: true });

            const buf = fs.readFileSync(filePath);

            const opt: any = {
                data: buf
            };

            if (process.env.NODE_ENV === "production") {
                opt.wasmBinary = loadWasm();
            }

            const extractor = await unrar.createExtractorFromData(opt);

            const extracted = extractor.extract({});

            const files = [...extracted.files];

            const dirs: any[] = [];
            const fileList: any[] = [];

            for (const file of files) {
                if (file.fileHeader.flags.directory) {
                    dirs.push(file);
                } else {
                    fileList.push(file);
                }
            }

            let count = 0;
            const total = files.length;

            const update = () => {
                progress(Math.round((count / total) * 100));
            };

            // 创建目录
            for (const dir of dirs) {
                fs.mkdirSync(
                    path.join(targetFolder, dir.fileHeader.name),
                    { recursive: true }
                );
                count++;
                update();
            }

            // 写文件
            for (const file of fileList) {
                const outPath = path.join(targetFolder, file.fileHeader.name);

                fs.mkdirSync(path.dirname(outPath), { recursive: true });

                fs.writeFileSync(outPath, file.extraction);

                count++;
                update();
            }

            progress(100);
        } catch (e) {
            progress(-1);
            throw e;
        }
    }

    async unGz(
        filePath: string,
        targetFolder: string,
        progress: (value: number) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                fs.mkdirSync(targetFolder, { recursive: true });

                const stat = fs.statSync(filePath);
                const totalSize = stat.size;
                let processedSize = 0;

                const fileName = path.basename(filePath).replace(/\.gz$/, "");
                const outputPath = path.join(targetFolder, fileName);

                const readStream = fs.createReadStream(filePath);
                const gunzip = new Gunzip({});
                const writeStream = fs.createWriteStream(outputPath);

                readStream.on("data", (chunk) => {
                    processedSize += chunk.length;
                    progress(Math.round((processedSize / totalSize) * 100));
                });

                const fail = (err: any) => {
                    progress(-1);
                    reject(err);
                };

                readStream.on("error", fail);
                gunzip.on("error", fail);
                writeStream.on("error", fail);

                writeStream.on("finish", () => {
                    progress(100);
                    resolve();
                });

                readStream.pipe(gunzip).pipe(writeStream);
            } catch (e) {
                progress(-1);
                reject(e);
            }
        });
    }

    // 压缩进度获取
    async compress(
        format: "tar" | "zip",
        level: number,
        targetFilePath: string,
        filePaths: string[],
        directories: string[],
        progress: (value: number) => void,
        gzip: boolean = false
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });

                const output = fs.createWriteStream(targetFilePath);

                const archive = archiver(format, {
                    zlib: { level },
                    gzip
                });

                progress(0);

                let finished = false;

                const done = () => {
                    if (!finished) {
                        finished = true;
                        progress(100);
                        resolve();
                    }
                };

                const fail = (err: any) => {
                    if (!finished) {
                        finished = true;
                        progress(-1);
                        reject(err);
                    }
                };

                output.on("close", done);
                output.on("error", fail);

                archive.on("error", fail);

                // ⚠️ progress 事件不可靠，但保留
                archive.on("progress", (data) => {
                    const { processedBytes, totalBytes } = data.fs || {};
                    if (totalBytes > 0) {
                        const percent = Math.min(
                            99,
                            Math.round((processedBytes / totalBytes) * 100)
                        );
                        progress(percent);
                    }
                });

                archive.pipe(output);

                // files
                for (const filePath of filePaths || []) {
                    archive.file(filePath, {
                        name: path.basename(filePath)
                    });
                }

                // directories
                for (const dir of directories || []) {
                    archive.directory(dir, path.basename(dir));
                }

                archive.finalize();
            } catch (e) {
                progress(-1);
                reject(e);
            }
        });
    }

    async compressGz(
        level: number,
        targetFilePath: string,
        filePaths: string[],
        directories: string[],
        progress: (value: number) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const inputPath = filePaths?.[0];

                if (!inputPath) {
                    throw new Error("gzip 压缩必须提供至少一个文件");
                }

                fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });

                const outputPath = targetFilePath.endsWith(".gz")
                    ? targetFilePath
                    : targetFilePath + ".gz";

                const stat = fs.statSync(inputPath);
                const totalSize = stat.size;

                let processed = 0;

                const readStream = fs.createReadStream(inputPath);
                const gzip = new Gzip({ level });
                const writeStream = fs.createWriteStream(outputPath);

                progress(0);

                let finished = false;

                const done = () => {
                    if (!finished) {
                        finished = true;
                        progress(100);
                        resolve();
                    }
                };

                const fail = (err: any) => {
                    if (!finished) {
                        finished = true;
                        progress(-1);
                        reject(err);
                    }
                };

                readStream.on("data", (chunk) => {
                    processed += chunk.length;

                    if (totalSize > 0) {
                        progress(
                            Math.min(99, Math.round((processed / totalSize) * 100))
                        );
                    }
                });

                readStream.on("error", fail);
                gzip.on("error", fail);
                writeStream.on("error", fail);

                writeStream.on("close", done);

                readStream.pipe(gzip).pipe(writeStream);
            } catch (e) {
                progress(-1);
                reject(e);
            }
        });
    }


    async handle_un(format:FileCompressType,sysSourcePath,targetFolder,outHanle) {
        if (format === FileCompressType.tar) {
            await fileCompress.unTar(sysSourcePath, targetFolder, outHanle)
        } else if (format === FileCompressType.zip) {
            await fileCompress.unZip(sysSourcePath, targetFolder, outHanle)
        } else if (format === FileCompressType.tar_gz) {
            await fileCompress.unTar(sysSourcePath, targetFolder, outHanle, true)
        } else if (format === FileCompressType.rar) {
            await fileCompress.unRar(sysSourcePath, targetFolder, outHanle)
        } else if(format === FileCompressType.gz) {
            await fileCompress.unGz(sysSourcePath, targetFolder, outHanle)
        }
    }

}

export const fileCompress = new FileCompress()