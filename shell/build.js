process.env.NODE_ENV = 'production';

const {Listr} = require("listr2");
const webpack = require('webpack');
const config = require('./config/webpack.web.config.js');
const args = process.argv.slice(2)??[];  // slice to remove the first two default values
let serverConfig ;
const is_exe = args[0]==="exe"
const is_npm = args[0]==="npm"
if (args.length ===0 || is_npm) {
    serverConfig = require('./config/webpack.npm.config.js');
    console.log('npm打包')
} else if (is_exe) {
    console.log('二进制打包')
    serverConfig = require('./config/webpack.exe.config.js');
} else {
    console.error('无法识别打包环境')
}
const {copyFileSync} = require("fs");
const fs = require("fs");
const path = require("path");
const {rimraf} = require("rimraf");
const fse = require("fs-extra");
const {copy_wintun_dll} = require("./config/common-bin.config");
const {execSync} = require("child_process");

// const test_p = path.join(process.cwd(), "node_modules","node-process-watcher");
// const test_p2 = path.join(process.cwd(), "node_modules","better-sqlite3");
// console.log(`存在node-process-watcher ${fs.existsSync(test_p)}`);
// console.log(`存在better-sqlite3 ${fs.existsSync(test_p2)}`);

function ensure_copyFileSync(sourcePath, destPath) {
    fse.ensureDirSync(path.dirname(destPath))
    copyFileSync(sourcePath, destPath);
}

function exec_sync(cmd) {
    try {
        execSync(cmd)
    } catch (error) {
        // 将标准输出的 Buffer 转换为可读字符串并抛出
        throw new Error(error.stdout ? error.stdout.toString() : error.message);
    }
}

/**
 * 清理 node_modules 中 @ljharb 系列包残留的 tsconfig.json
 * 这些 tsconfig.json 中 extends 了 @ljharb/tsconfig，
 * 但 @ljharb/tsconfig 通常被 npm hoist 到顶层或根本未安装，
 * 在 Windows CI 上会导致 webpack ENOENT 错误
 */
function clean_ljharb_tsconfig() {
    const patterns = [
        'es-set-tostringtag',
        'hasown',
        'side-channel',
        'is-generator-function',
        'gopd',
        'has-symbols',
        'has-tostringtag',
        'get-intrinsic',
        'set-function-name',
        'define-data-property',
        'function-bind',
        'es-define-property',
        'es-errors',
        'es-object-atoms',
        'call-bind-apply-helpers',
        'dunder-proto',
        'es-abstract',
    ];
    const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
    let cleaned = 0;
    for (const pkg of patterns) {
        // 顶层 node_modules
        const tsPath = path.join(nodeModulesDir, pkg, 'tsconfig.json');
        if (fs.existsSync(tsPath)) {
            fs.unlinkSync(tsPath);
            cleaned++;
        }
        // 嵌套 node_modules（扫描所有 xxx/node_modules/{pkg}/tsconfig.json）
        try {
            const entries = fse.readdirSync(nodeModulesDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const nestedDir = path.join(nodeModulesDir, entry.name, 'node_modules', pkg, 'tsconfig.json');
                if (fs.existsSync(nestedDir)) {
                    fs.unlinkSync(nestedDir);
                    cleaned++;
                }
                // 再深一层 @scope/pkg
                if (entry.name.startsWith('@')) {
                    const scopeDir = path.join(nodeModulesDir, entry.name);
                    const subEntries = fse.readdirSync(scopeDir, { withFileTypes: true });
                    for (const subEntry of subEntries) {
                        if (!subEntry.isDirectory()) continue;
                        const deepPath = path.join(scopeDir, subEntry.name, 'node_modules', pkg, 'tsconfig.json');
                        if (fs.existsSync(deepPath)) {
                            fs.unlinkSync(deepPath);
                            cleaned++;
                        }
                    }
                }
            }
        } catch (e) {
            // 忽略扫描错误
        }
    }
    if (cleaned > 0) {
        console.log(`[clean_ljharb_tsconfig] 已清理 ${cleaned} 个 tsconfig.json`);
    }
}

const tasksLister = new Listr(
    [
        {
            title:"清理build目录执行tsc",
            task:async ()=>{
                clean_ljharb_tsconfig();
                fse.removeSync(path.join(__dirname, "..", "build"));
                exec_sync("npx tsc")
            }
        },
        {
            title:"编译plugin到build/plugin目录",
            task:async ()=>{
                exec_sync("npx tsc -p tsconfig.plugin.json")
            }
        },
        {
            title:"子线程构建",
            task:async ()=>{
                return  Promise.all([new Promise((res, rej) => {
                    const config = {...serverConfig};
                    config['entry'] = path.join(__dirname, "..", "build", "server", "main","threads","filecat","threads.work.filecat.js")
                    config['output'] = {...config['output']}
                    config['output']['filename'] = 'threads.work.filecat.js'
                        // 第一个
                    webpack(config, (err, stats) => {
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
                        // ensure_copyFileSync(path.resolve("src/main/watch.js"), path.join(__dirname, "..", "build", "watch.js"))
                        if(is_exe) {
                            copy_wintun_dll()
                            fs.copyFileSync(path.resolve('package.json'), path.resolve('build','package.json'));
                        }

                        ensure_copyFileSync(path.resolve("node_modules/node-unrar-js/esm/js/unrar.wasm"), path.join(__dirname, "..", "build", "unrar.wasm"))
                        ensure_copyFileSync(path.resolve("node_modules/jieba-wasm/pkg/nodejs/jieba_rs_wasm_bg.wasm"), path.join(__dirname, "..", "build", "jieba_rs_wasm_bg.wasm"))

                        rimraf.sync(path.join(__dirname,"..","build","server"));
                        rimraf.sync(path.join(__dirname,"..","build","build")); //better-sqlite3 莫名其妙的

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
                        // fse.copySync(path.join(__dirname, "..", "src", "web", "meta", 'resources',"assets","excalidraw-assets"),path.join(__dirname, "..", "build", "dist","excalidraw-assets"));
                        // fse.copySync(
                        //     path.resolve('node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts'),
                        //     path.join(__dirname, "..", "build", "dist", "fonts")
                        // );
                        copyFileSync(path.join(__dirname, "..", "src", "web", "project", 'component',"file","component","image","js","filerobot-image-editor.min.js"), path.join(__dirname, "..", "build", "dist","filerobot-image-editor.min.js"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "project", "component","proxy","rdp","client","js","rle.js"), path.join(__dirname, "..", "build", "dist","rle.js"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "meta","resources","img","favicon-16x16.png"), path.join(__dirname, "..", "build", "dist","favicon-16x16.png"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "resources","img","favicon-32x32.png"), path.join(__dirname, "..", "build", "dist","favicon-32x32.png"));
                        const base_theme = path.join(__dirname, "..", "src", "web", "meta", "resources","css","themes")
                        const files = fs.readdirSync(base_theme)
                        for (const file of files) {
                            copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "resources","css","themes",file), path.join(__dirname, "..", "build", "dist",file));
                        }
                        // copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "resources","css","themes","dark.css"), path.join(__dirname, "..", "build", "dist","dark.css"));
                        // copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "resources","css","themes","modern.css"), path.join(__dirname, "..", "build", "dist","modern.css"));
                        // copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "component","resources","img","svg.png"), path.join(__dirname, "..", "build", "dist","svg.png"))
                        res(true);
                    });
                })
            },
            // options: {persistentOutput: true},
        },
    ],
    {
        exitOnError: true,
    }
);
tasksLister.run();
