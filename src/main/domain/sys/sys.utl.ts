import {execSync} from "child_process";
import {sysType} from "../shell/shell.service";
import {getProcessAddon} from "../bin/bin";
import {Env} from "../../../common/Env";



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

}