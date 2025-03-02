import {execSync} from "child_process";
import {sysType} from "../shell/shell.service";
import {getProcessAddon} from "../bin/bin";

let sys_pre = "/api";
if(process.env.NODE_ENV==="production") {
    sys_pre = `${process.env.base_url??""}/api`;
} else {
    try {
        sys_pre = `${require("../../../../shell/config/env").base_url}/api`;
    } catch(e) {
        sys_pre = "/api"
    }
}
export class SystemUtil {

    // 检查某个程序有没有安装到path可以使用
    public static commandIsExist(cmd: string): boolean {
        try {
            execSync (cmd, { stdio: 'pipe' });
            return true;
        } catch (e) {
            return false;
        }
    }

    public static killProcess(pid): void {
        if(!pid)return;
        if (sysType === 'win' || sysType === 'linux') {
            // SystemUtil.commandIsExist(`taskkill /pid ${pid} /f /t`)
            getProcessAddon().kill_process(pid,true);
        } else {
            SystemUtil.commandIsExist(`kill -9 ${pid} `)
        }
    }

    public static  get_sys_base_url_pre() {
        return sys_pre;
    }
}