import {getSys} from "../shell/shell.service";
import {SysEnum} from "../../../common/req/user.req";
import path from "path";
import {settingService} from "../setting/setting.service";
import {SysSoftware} from "../../../common/req/setting.req";

const {createRequire} = require('node:module');
export const require_c = createRequire(__filename);
// import {node_process_watcher} from "node-process-watcher";
const ffmpeg = require('fluent-ffmpeg');

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
