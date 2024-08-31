import {getSys} from "../shell/shell.service";
import {SysEnum} from "../../../common/req/user.req";
import path from "path";
import {settingService} from "../setting/setting.service";

const { createRequire } = require('node:module');
export const require_c = createRequire(__filename);

const ffmpeg  = require('fluent-ffmpeg');

export function getFfmpeg() {
    const list = settingService.getSoftware();
    for (const item of list) {
        if (item.id === ffmpeg.ffmpeg && item.installed && !!item.path) {
            ffmpeg.setFfmpegPath(item.path);
        }
    }
    return ffmpeg;
}

let child;
export function getProcessAddon() {
    if (child) {
        return child;
    }
    if (getSys()===SysEnum.linux) {
        child = require_c(path.join(__dirname,'linux-process.node'));
    }  else if(getSys()===SysEnum.win) {
        child = require_c(path.join(__dirname,'win-process.node'));
    }
    return child;
}
