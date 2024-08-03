import {CmdType, WsData} from "../../../common/frame/WsData";
import si from "systeminformation";
import os from "os";
import {SysPojo} from "../../../common/req/sys.pojo";
import {Wss} from "../../../common/frame/ws.server";
let sysJobInterval: any = null;

const sysWssMap = new Map<string, Wss>();

class SysSystemService {

    private async openSysPush(wss: Wss) {
        if (!sysJobInterval) {
            sysJobInterval = setInterval(async () => {
                if (sysWssMap.size === 0) {
                    clearInterval(sysJobInterval);
                    sysJobInterval = null;
                    return;
                }
                const keys = sysWssMap.keys();
                for (const socketId of keys) {
                    const wss = sysWssMap.get(socketId)!;
                    try {
                        await this.pushSysInfo(wss);
                    } catch (e) {
                        console.log(e)
                        console.log('系统信息推送失败sys')
                        clearInterval(sysJobInterval);
                        sysJobInterval = null;
                        if (wss) {
                            // wss.ws.close();
                            sysWssMap.delete(socketId);
                        }
                    }
                }
            }, 1000);
        } else {
            try {
                await this.pushSysInfo(wss);
            } catch (e) {
                sysWssMap.delete(wss.id)
            }
        }
    }

    async pushSysInfo(wss: Wss) {
        const currentLoad = await si.currentLoad();
        // 获取总内存（单位：字节）
        const totalMemory = os.totalmem();
        // 剩余（单位：字节）
        const freeMemory = os.freemem();
        const result = new WsData<SysPojo>(CmdType.sys_getting);
        result.context = {
            memTotal: (totalMemory / (1024 * 1024 * 1024)).toFixed(2),
            memLeft: (freeMemory / (1024 * 1024 * 1024)).toFixed(2),
            cpu_currentLoad: currentLoad.currentLoad.toFixed(2),
        };
        if (wss.ws.readyState !==1) {
            throw  "断开连接";
        }
        wss.sendData(result.encode())
    }

    // 订阅要满足幂等性
    async sys(data: WsData<any>) {
        const id = (data.wss as Wss).id;
        if (sysWssMap.get(id)) {
            return;
        }
        sysWssMap.set((data.wss as Wss).id, (data.wss as Wss))
        await this.openSysPush((data.wss as Wss));
    }

    async sysCancel(data: WsData<any>) {
        const id = (data.wss as Wss).id;
        sysWssMap.delete(id);
        (data.wss as Wss).ws.close();
    }

}

export const SysSystemServiceImpl = new SysSystemService();
