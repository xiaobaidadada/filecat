import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {SysPojo} from "../../../common/req/sys.pojo";
import {ShellInitPojo} from "../../../common/req/ssh.pojo";
import {resolve_local_path} from "../file/mount_adapter";
import {mountService} from "../mount/mount.service";
import {MountShell} from "../mount/driver/file_driver";

/**
 * 挂载目录下的终端。
 *
 * 与本地终端（shell.service）、FileCat 对端终端（ssh.service）并列：
 * 本地走 pty，对端走对端 FileCat 的 WS，这里走驱动自己的 SSH shell 通道。
 *
 * 只有实现了 open_shell 的驱动能开，目前是 SFTP 挂载。
 * 会话按 WS 连接 id 存在 wss.dataMap 里，连接断开即关闭。
 */
export class MountShellService {

    async open(data: WsData<ShellInitPojo>) {
        const wss = data.wss as Wss;
        // 前端收起终端时不带 context，表示关闭这条 shell
        if (!data.context) {
            this.close(wss);
            return;
        }
        const pojo = data.context;
        const send = (str: string) => {
            const result = new WsData<SysPojo>(CmdType.mount_ssh_shell_getting);
            result.context = str;
            wss.sendData(result.encode());
        };
        try {
            const abs_path = decodeURIComponent(pojo.init_path ?? "");
            const res = resolve_local_path(abs_path);
            if (!res.match) {
                send(`\r\n\x1b[31mNot a mount directory: ${abs_path}\x1b[0m\r\n`);
                return;
            }
            const driver = mountService.driver_of(res.match.mount);
            if (!driver.open_shell) {
                send(`\r\n\x1b[31mMount (${driver.display_name}) does not support a terminal\x1b[0m\r\n`);
                return;
            }
            const shell = await driver.open_shell(res.inner_path, pojo.rows, pojo.cols);
            // 先注册输出再解引用，避免首屏提示符丢失
            shell.on_data((str) => send(str));
            wss.dataMap.set(this.key(wss), shell);
            wss.setClose(() => this.close(wss));
        } catch (e) {
            send(`\r\n\x1b[31m${e?.message ?? e}\x1b[0m\r\n`);
        }
    }

    send(data: WsData<ShellInitPojo>) {
        const wss = data.wss as Wss;
        const shell = wss.dataMap.get(this.key(wss)) as MountShell | undefined;
        const input = data.context?.cmd;
        if (!shell || input == null) {
            return;
        }
        shell.write(input);
    }

    /** 关闭当前连接的挂载终端（只关这条 shell，驱动连接复用不动） */
    close(wss: Wss) {
        const key = this.key(wss);
        const shell = wss.dataMap.get(key) as MountShell | undefined;
        if (!shell) {
            return;
        }
        wss.dataMap.delete(key);
        shell.close();
    }

    private key(wss: Wss) {
        return `mount_shell_${wss.id}`;
    }
}

export const mountShellService = new MountShellService();
