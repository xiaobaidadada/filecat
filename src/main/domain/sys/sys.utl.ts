import {execSync} from "child_process";
import {sysType} from "../shell/shell.service";
import pidtree from "pidtree";

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
            SystemUtil.commandIsExist(`taskkill /pid ${pid} /f /t`)
        } else {
            pidtree(pid, function (err, pids) {
                if (pids) {
                    for (const id  of pids) {
                        SystemUtil.commandIsExist(`kill  ${id} `)
                    }
                }
            })
            SystemUtil.commandIsExist(`kill  ${pid} `)
        }
    }
}