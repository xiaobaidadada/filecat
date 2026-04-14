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
import {pipeline} from "stream/promises";
import {FileUtil} from "./FileUtil";

export class FileCompress extends LifecycleRecordService {

    async unZip(
        filePath: string,
        targetFolder: string,
        progress: (value: number) => void
    ): Promise<void> {
        try {
            fs.mkdirSync(targetFolder, {recursive: true});

            const readStream = fs.createReadStream(filePath);

            let totalSize = fs.statSync(filePath).size;
            let processed = 0;
            let last = 0;

            readStream.on("data", (chunk) => {
                processed += chunk.length;
                const percent = Math.min(99, Math.floor((processed / totalSize) * 100));

                if (percent !== last) {
                    last = percent;
                    progress(percent);
                }
            });

            await pipeline(
                readStream,
                unzip_stream.Extract({path: targetFolder})
            );

            progress(100);
        } catch (e) {
            progress(-1);
            throw e;
        }
    }

    async unTar(
        filePath: string,
        targetFolder: string,
        progress: (value: number) => void,
        gzip: boolean = false
    ): Promise<void> {
        const totalSize = fs.statSync(filePath).size;
        let processed = 0;
        let lastPercent = 0;

        const readStream = fs.createReadStream(filePath);

        readStream.on("data", (chunk) => {
            processed += chunk.length;

            const percent = Math.floor((processed / totalSize) * 100);

            // 避免频繁回调
            if (percent !== lastPercent) {
                lastPercent = percent;
                progress(percent);
            }
        });

        await pipeline(
            readStream,
            tar.x({
                cwd: targetFolder,
                gzip
            })
        );

        progress(100);
    }

    async unRar(
        filePath: string,
        targetFolder: string,
        progress: (value: number) => void
    ): Promise<void> {
        try {
            fs.mkdirSync(targetFolder, {recursive: true});

            const buf = await fs.promises.readFile(filePath);

            const opt: any = {
                data: buf
            };

            if (process.env.NODE_ENV === "production") {
                opt.wasmBinary = loadWasm();
            }

            const extractor = await unrar.createExtractorFromData(opt);
            const extracted = extractor.extract({});

            const files = [...extracted.files];

            const dirs: typeof files = [];
            const fileList: typeof files = [];

            for (const file of files) {
                if (file.fileHeader.flags.directory) {
                    dirs.push(file);
                } else {
                    fileList.push(file);
                }
            }

            const total = files.length || 1;
            let doneCount = 0;

            const update = () => {
                const percent = Math.floor((doneCount / total) * 100);
                progress(percent);
            };

            // 1️⃣ 创建目录（同步OK，成本低）
            for (const dir of dirs) {
                const dirPath = path.join(targetFolder, dir.fileHeader.name);
                fs.mkdirSync(dirPath, {recursive: true});

                doneCount++;
                update();
            }

            // 2️⃣ 写文件（改成 async，避免阻塞）
            for (const file of fileList) {
                const outPath = path.join(targetFolder, file.fileHeader.name);

                fs.mkdirSync(path.dirname(outPath), {recursive: true});

                await fs.promises.writeFile(outPath, file.extraction);

                doneCount++;
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
        fs.mkdirSync(targetFolder, {recursive: true});

        const stat = fs.statSync(filePath);
        const total = stat.size;

        let processed = 0;
        let last = 0;

        const fileName = path.basename(filePath).replace(/\.gz$/, "");
        const outputPath = path.join(targetFolder, fileName);

        const readStream = fs.createReadStream(filePath);

        readStream.on("data", (chunk) => {
            processed += chunk.length;

            const percent = Math.min(
                99,
                Math.floor((processed / total) * 100)
            );

            if (percent !== last) {
                last = percent;
                progress(percent);
            }
        });

        await pipeline(
            readStream,
            new Gunzip({}),
            fs.createWriteStream(outputPath)
        );

        progress(100);
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
        fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });

        const output = fs.createWriteStream(targetFilePath);

        const archive = archiver(format, {
            zlib: { level },
            gzip
        });

        progress(0);

        let last = 0;

        archive.on("progress", (data) => {
            const p = data.fs;

            if (p?.processedBytes && p?.totalBytes) {
                let percent = Math.floor((p.processedBytes / p.totalBytes) * 80); // 只占80%

                // 再加上输出进度
                const written = archive.pointer();
                const total = p.totalBytes;

                if (written && total) {
                    percent += Math.floor((written / total) * 20);
                }

                percent = Math.min(99, percent);

                if (percent !== last) {
                    last = percent;
                    progress(percent);
                }
            }
        });

        archive.on("warning", (err: any) => {
            // 非致命错误不终止
            console.warn(err);
        });

        archive.on("error", (err: any) => {
            progress(-1);
            throw err;
        });

        const done = new Promise<void>((resolve, reject) => {
            output.on("close", resolve);
            output.on("error", reject);
        });

        archive.pipe(output);

        for (const filePath of filePaths || []) {
            archive.file(filePath, {
                name: path.basename(filePath)
            });
        }

        for (const dir of directories || []) {
            archive.directory(dir, path.basename(dir));
        }

        await archive.finalize();
        await done;

        progress(100);
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

                fs.mkdirSync(path.dirname(targetFilePath), {recursive: true});

                const outputPath = targetFilePath.endsWith(".gz")
                    ? targetFilePath
                    : targetFilePath + ".gz";

                const stat = fs.statSync(inputPath);
                const totalSize = stat.size;

                let processed = 0;

                const readStream = fs.createReadStream(inputPath);
                const gzip = new Gzip({level});
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


    async handle_un(format: FileCompressType, sysSourcePath, targetFolder, outHanle) {
        await FileUtil.ensure_dir(targetFolder)
        if (format === FileCompressType.tar) {
            await fileCompress.unTar(sysSourcePath, targetFolder, outHanle)
        } else if (format === FileCompressType.zip) {
            await fileCompress.unZip(sysSourcePath, targetFolder, outHanle)
        } else if (format === FileCompressType.tar_gz) {
            await fileCompress.unTar(sysSourcePath, targetFolder, outHanle, true)
        } else if (format === FileCompressType.rar) {
            await fileCompress.unRar(sysSourcePath, targetFolder, outHanle)
        } else if (format === FileCompressType.gz) {
            await fileCompress.unGz(sysSourcePath, targetFolder, outHanle)
        }
    }

}

export const fileCompress = new FileCompress()