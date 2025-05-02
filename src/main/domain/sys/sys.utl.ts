import {execSync} from "child_process";
import {sysType} from "../shell/shell.service";
import {getProcessAddon} from "../bin/bin";
import {Env} from "../../../common/Env";



export class SystemUtil {

    // 执行某个命令 并返回 是否执行成功结果
    public static commandIsExist(cmd: string): boolean {
        try {
            // 异步的方式暂时没有跨平台的方式判断 exec会堵塞 bash等命令
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