import {execSync} from "child_process";
import {sysType} from "../shell/shell.service";

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
        if (sysType === 'win') {
            SystemUtil.commandIsExist(`taskkill /pid ${pid} /f /t`) // todo 关闭一个控制台进程下的所有子进程
        } else {
            SystemUtil.commandIsExist(`kill -9 ${pid} `)
        }
    }
}