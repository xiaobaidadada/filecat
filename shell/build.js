const {Listr} = require("listr2");
const webpack = require('webpack');
const os = require("os");
const config = require('./config/webpack.web.config.js');
const args = process.argv.slice(2)??[];  // slice to remove the first two default values
let serverConfig ;
const is_exe = args[0]==="exe"
const is_npm = args[0]==="npm"
if (args.length ===0 || is_npm) {
    serverConfig = require('./config/webpack.npm.config.js');
} else if (is_exe) {
    serverConfig = require('./config/webpack.exe.config.js');
} else {
    console.error('无法识别打包环境')
}
const {copyFileSync} = require("fs");
const fs = require("fs");
const path = require("path");
const {rimraf} = require("rimraf");
const fse = require("fs-extra");
const {get_webpack_work_config} = require('./config/webpack.worker.get.js');
const {copy_wintun_dll} = require("./config/common-bin.config");


function ensure_copyFileSync(sourcePath, destPath) {
    fse.ensureDirSync(path.dirname(destPath))
    copyFileSync(sourcePath, destPath);
}
// 只能复制文件
function copyFiles(sourceDir,destDir) {
    try {
        const files =  fs.readdirSync(sourceDir); // 获取源目录下的所有文件/文件夹

        for (const file of files) {
            const sourcePath = path.join(sourceDir, file);
            const destPath = path.join(destDir, file);
            const stat =  fs.statSync(sourcePath); // 获取文件信息，判断是文件还是目录
            if (stat.isDirectory()) {
                // 如果是目录 暂时不做处理
            } else {
                // 如果是文件，则直接复制
                fs.copyFileSync(sourcePath, destPath);
            }
        }
        console.log(`${sourceDir}:下所有文件复制完成!\n`);
    } catch (err) {
        console.error('复制文件时出错:', err);
    }
}

const tasksLister = new Listr(
    [
        {
            title:"子线程构建",
            task:async ()=>{
                return  Promise.all([new Promise((res, rej) => {
                    // 第一个
                    webpack(get_webpack_work_config({
                        entry_path:path.join(__dirname, "..", "build", "server", "main","threads","filecat","threads.work.filecat.js"),
                        output_name:'threads.work.filecat.js',
                        is_exe
                    }), (err, stats) => {
                        if (err || stats.hasErrors()) {
                            console.error(err || stats.toString());
                            rej(false);
                            return;
                        }
                        res(true);
                    });

                })])
            }
        },
        {
            title: "构建服务端",
            task: async () => {
                return new Promise((res, rej) => {
                    webpack(serverConfig, (err, stats) => {
                        if (err || stats.hasErrors()) {
                            console.error(err || stats.toString());
                            rej(false);
                            return;
                        }
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "bin", "win-process.node"), path.join(__dirname, "..", "build", "win-process.node"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "bin", "linux-process.node"), path.join(__dirname, "..", "build", "linux-process.node"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "tun","ts","linux","linuxtun.node"), path.join(__dirname, "..", "build", "linuxtun.node"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "tun","ts","win","wintun.node"), path.join(__dirname, "..", "build", "wintun.node"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-amd64.dll"), path.join(__dirname, "..", "build", "wintun-amd64.dll"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-arm.dll"), path.join(__dirname, "..", "build", "wintun-arm.dll"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-arm64.dll"), path.join(__dirname, "..", "build", "wintun-arm64.dll"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-x86.dll"), path.join(__dirname, "..", "build", "wintun-x86.dll"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "bin", "ffmpeg"), path.join(__dirname, "..", "build", "ffmpeg"))
                        // copyFileSync(path.resolve("build/server/main/domain/file/file.worker.js"), path.join(__dirname, "..", "build", "file.worker.js"))

                        // 复制 子进程监控脚本
                        ensure_copyFileSync(path.resolve("src/main/watch.js"), path.join(__dirname, "..", "build", "watch.js"))
                        if(is_exe) {
                            copy_wintun_dll()
                            fs.copyFileSync(path.resolve('package.json'), path.resolve('build','package.json'));
                            // ensure_copyFileSync(path.resolve("node_modules/sqlite3/build/Release/node_sqlite3.node"), path.join(__dirname, "..", "build", "node_sqlite3.node"))
                        }

                        ensure_copyFileSync(path.resolve("node_modules/node-unrar-js/esm/js/unrar.wasm"), path.join(__dirname, "..", "build", "unrar.wasm"))
                        ensure_copyFileSync(path.resolve("node_modules/jieba-wasm/pkg/nodejs/jieba_rs_wasm_bg.wasm"), path.join(__dirname, "..", "build", "jieba_rs_wasm_bg.wasm"))

                        rimraf.sync(path.join(__dirname,"..","build","server"));

                        res(true);
                    });

                })

            },
        },
        {
            title: "构建web",
            task: async () => {
                return new Promise((res, rej) => {
                    webpack(config, (err, stats) => {
                        if (err || stats.hasErrors()) {
                            console.error(err || stats.toString());
                            rej(false);
                            return;
                        }
                        fse.copySync(path.join(__dirname, "..", "src", "web", "meta", 'resources',"assets","excalidraw-assets"),path.join(__dirname, "..", "build", "dist","excalidraw-assets"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "project", 'component',"file","component","image","js","filerobot-image-editor.min.js"), path.join(__dirname, "..", "build", "dist","filerobot-image-editor.min.js"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "project", "component","proxy","rdp","client","js","rle.js"), path.join(__dirname, "..", "build", "dist","rle.js"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "meta","resources","img","favicon-16x16.png"), path.join(__dirname, "..", "build", "dist","favicon-16x16.png"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "resources","img","favicon-32x32.png"), path.join(__dirname, "..", "build", "dist","favicon-32x32.png"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "resources","css","themes","dark.css"), path.join(__dirname, "..", "build", "dist","dark.css"));
                        // copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "component","resources","img","svg.png"), path.join(__dirname, "..", "build", "dist","svg.png"))
                        res(true);
                    });
                })
            },
            // options: {persistentOutput: true},
        },
    ],
    {
        exitOnError: false,
    }
);
tasksLister.run();
