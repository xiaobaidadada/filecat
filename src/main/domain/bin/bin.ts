import {getSys} from "../shell/shell.service";
import {SysEnum} from "../../../common/req/user.req";
import path from "path";
import {settingService} from "../setting/setting.service";
import {SysSoftware} from "../../../common/req/setting.req";
import os from "os";
import {Env} from "../../../common/Env";

const fs = require('fs');
import fse from 'fs-extra'

let tuntap2 :any
export function get_tun_require() {
    if(tuntap2) return tuntap2
    const {
        LinuxTun,
        LinuxTap,
        Wintun,
        MacTun
    } = get_bin_dependency('@xiaobaidadada/node-tuntap2-wintun');
    tuntap2 = {
        LinuxTun,
        LinuxTap,
        Wintun,
        MacTun
    }
    return tuntap2
}

// const {createRequire} = require('node:module');
// export const require_c = createRequire(__filename); // 之前为了兼容 pkg
// import {node_process_watcher} from "node-process-watcher";
const ffmpeg = require('fluent-ffmpeg');

// 从虚拟路径复制文件到实际路径
function writeToStorage(virtualFilePath, realInstallPath) {
    const filename = path.basename(virtualFilePath);
    // const realInstallPath = path.join(realInstallDir, filename);
    if (!fs.existsSync(realInstallPath)) {
        const data = fs.readFileSync(virtualFilePath);
        fs.writeFileSync(realInstallPath, data);
    }
    // return realInstallPath;
}

function get_wintun_dll_arch() {
    let cpuArch:any = os.arch();
    switch (cpuArch) {
        case 'arm':
        case 'arm64':
            break;
        case 'ia32':
            cpuArch = "x86";
            break;
        case 'x64':
            cpuArch = "amd64";
            break;
        default:
            // console.log('未知架构:', arch);
            break;
    }
    return cpuArch;
}

export function get_wintun_dll_path(): string {
    try {
        // const relp = path.join(Env.work_dir, "packges","filecat_dlls");
        // fse.ensureDirSync(relp);
        const cpuArch = get_wintun_dll_arch();
        const winfilename = `wintun${cpuArch ? `-${cpuArch}` : ''}.dll`;
        // pkg  env
        if (process.env.NODE_ENV === "production") {
            // 在main.js的根目录下
            return path.join(__dirname, winfilename); // 避免升级的时候dll正在被使用无法升级
        }
        else {
            // npm env 本地
            return path.resolve("node_modules/@xiaobaidadada/node-tuntap2-wintun/wintun_dll", winfilename)
        }
    } catch (e) {
        console.log(e);
    }
}




export function getFfmpeg() {
    const list = settingService.getSoftware();
    for (const item of list) {
        if (item.id === SysSoftware.ffmpeg && item.installed && !!item.path) {
            ffmpeg.setFfmpegPath(item.path);
        }
    }
    return ffmpeg;
}

let smartctl = "smartctl";

export function getSmartctl() {
    const list = settingService.getSoftware();
    for (const item of list) {
        if (item.id === SysSoftware.smartmontools && item.installed && !!item.path) {
            smartctl = item.path;
        }
    }
    return smartctl;
}

let ntfs_3g = "ntfs-3g";

export function get_ntfs_3g() {
    const list = settingService.getSoftware();
    for (const item of list) {
        if (item.id === SysSoftware.ntfs_3g && item.installed && !!item.path) {
            ntfs_3g = item.path;
        }
    }
    return ntfs_3g;
}

// let child;
export function getProcessAddon() {
    // if (child) {
    //     return child;
    // }
    const type = getSys();
    // if (type === SysEnum.linux || type === SysEnum.win) {
        // child = require_c(path.join(__dirname,'linux-process.node'));
        const {node_process_watcher} = get_bin_dependency("node-process-watcher",false);
        return node_process_watcher;
    // }
    // else if(getSys()===SysEnum.win) {
    //     child = require_c(path.join(__dirname,'win-process.node'));
    // }
}

let wasmBinary;

export function loadWasm() {
    if (!wasmBinary) {
        // 读取 .wasm 文件的二进制内容
        wasmBinary = fs.readFileSync(path.join(__dirname, 'unrar.wasm'));
    }
    return wasmBinary;
}

let sys_pre;
let base_url;

function init_pre_path() {
    if (process.env.NODE_ENV === "production") {
        sys_pre = `${Env.base_url || process.env.base_url || ""}/api`;
        base_url = Env.base_url || process.env.base_url || "";
    } else {
        try {
            sys_pre = `${Env.base_url || require("../../../../shell/config/env").base_url || ""}/api`;
            base_url = Env.base_url || require("../../../../shell/config/env").base_url || "";
        } catch (e) {
            sys_pre = "/api"
            base_url = "";
        }
    }
}


export function get_sys_base_url_pre() {
    if (sys_pre === undefined) {
        init_pre_path();
    }
    return sys_pre;
}

export function get_base() {
    if (base_url === undefined) {
        init_pre_path();
    }
    return base_url;
}

export function get_bin_dependency(module:
                                   "@xiaobaidadada/dockerode"
                                    | "@xiaobaidadada/node-pty-prebuilt"
                                   | "@xiaobaidadada/node-tuntap2-wintun"
                                   | "@xiaobaidadada/ssh2-prebuilt"
                                   | "node-process-watcher",
                                   auto_throw = false
) {
    try {
        if(process.env.run_env === 'exe') {
            //  防止 TDZ 错误 同时又可以 让 webpack打包 具体要不要忽略-在webpack中手动控制
            switch (module) {
                case "@xiaobaidadada/dockerode":
                    return require("@xiaobaidadada/dockerode");
                case "@xiaobaidadada/node-pty-prebuilt":
                    return require("@xiaobaidadada/node-pty-prebuilt");
                case "@xiaobaidadada/ssh2-prebuilt":
                    return require("@xiaobaidadada/ssh2-prebuilt");
                case "node-process-watcher":
                    return require("node-process-watcher");
                case "@xiaobaidadada/node-tuntap2-wintun":
                    return require("@xiaobaidadada/node-tuntap2-wintun")
                default:
                    throw {message:"不存在的包"}
            }
        }

        // webpack打包后会修改原本的 reuqire 加载函数
        return eval("require")(module);
    } catch (e) {
        // 当前平台没有这个能力
        console.log(`${process.env.run_env} 模块没有加载失败，请手动安装 npm 依赖( -g 安装的就尝试全局安装，本地仓库安装的就在仓库内安装)：${module} error ${e.message}`)
        // console.log(e)
        if(auto_throw) throw e;
    }
    return {};
}

let package_;
export function get_package_json() {
    if(package_) {
        return  package_;
    }
    let dir = __dirname;
    let count = 5; // 最多尝试n次向上搜索
    try {
        while (count > 0) {
            count--;
            const pkgPath = path.join(dir, "package.json");
            if (fs.existsSync(pkgPath)) {
                package_ = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
                break;
            }
            const parent = path.dirname(dir);
            if (parent === dir) break; // 到根目录了
            dir = parent;
        }
    } catch (e) {
        console.log(e)
    }
    if(!package_) {
        // 没有找到
        package_ = {}
    }
    return package_;
}

