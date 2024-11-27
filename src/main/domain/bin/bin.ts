import {getSys} from "../shell/shell.service";
import {SysEnum} from "../../../common/req/user.req";
import path from "path";
import {settingService} from "../setting/setting.service";
import {SysSoftware} from "../../../common/req/setting.req";
import os from "os";
import {Env} from "../../../common/Env";

const fs = require('fs');
import fse from 'fs-extra'

const {createRequire} = require('node:module');
export const require_c = createRequire(__filename);
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


export function get_wintun_dll_path(): string {
    try {
        const relp = path.join(Env.work_dir, "packges","filecat_dlls");
        fse.ensureDirSync(relp);
        let cpuArch = os.arch();
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
        const winfilename = `wintun${cpuArch ? `-${cpuArch}` : ''}.dll`;
        // pkg  env
        if (process.env.run_env === "docker") {
            return path.resolve(winfilename);
        } else if (process.env.run_env === "pkg") {
            const p = path.join(relp, winfilename);
            if (!fs.existsSync(p)) {
                writeToStorage(path.join(__dirname,winfilename),p);
                // writeToStorage(path.resolve("node_modules/@xiaobaidadada/node-tuntap2-wintun/wintun_dll",winfilename),p)
                // writeToStorage(path.resolve(winfilename), p)
            }
            return p;
        } else {
            // npm env
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
    if (type === SysEnum.linux || type === SysEnum.win) {
        // child = require_c(path.join(__dirname,'linux-process.node'));
        const {node_process_watcher} = require("node-process-watcher");
        return node_process_watcher;
    }
    // else if(getSys()===SysEnum.win) {
    //     child = require_c(path.join(__dirname,'win-process.node'));
    // }
}

let wasmBinary;
export function loadWasm() {
    if (!wasmBinary) {
        // 读取 .wasm 文件的二进制内容
        wasmBinary = fs.readFileSync(path.join(__dirname,'unrar.wasm'));
    }
    return wasmBinary;
}