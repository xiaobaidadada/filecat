import {getSys} from "../shell/shell.service";
import path from "path";
import os from "os";
import {Env} from "../../../common/Env";

const fs = require('fs');
import fse from 'fs-extra'
import {get_bin_dependency} from "./get_bin_dependency";

let tuntap2: any

export function get_tun_require() {
    if (tuntap2) return tuntap2
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
    let cpuArch: any = os.arch();
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
        } else {
            // npm env 本地
            return path.resolve("node_modules/@xiaobaidadada/node-tuntap2-wintun/wintun_dll", winfilename)
        }
    } catch (e) {
        console.log(e);
    }
}



// let child;
export function getProcessAddon() {
    // if (child) {
    //     return child;
    // }
    const type = getSys();
    // if (type === SysEnum.linux || type === SysEnum.win) {
    // child = require_c(path.join(__dirname,'linux-process.node'));
    const {node_process_watcher} = get_bin_dependency("node-process-watcher", false);
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

let package_;

export function get_package_json() {
    if (package_) {
        return package_;
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
    if (!package_) {
        // 没有找到
        package_ = {}
    }
    return package_;
}

