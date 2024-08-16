import {getSys} from "../shell/shell.service";
import {SysEnum} from "../../../common/req/user.req";
import path from "path";
import {settingService} from "../setting/setting.service";

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
