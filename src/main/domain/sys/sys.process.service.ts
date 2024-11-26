import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {getSys, sysType} from "../shell/shell.service";
import {SystemUtil} from "./sys.utl";
import {spawn} from "child_process";
import {SysPojo} from "../../../common/req/sys.pojo";
import {StringUtil} from "../../../common/StringUtil";
import path from "path";
import {getProcessAddon} from "../bin/bin";
import {SysEnum} from "../../../common/req/user.req";
import WebSocket from "ws";

let sysJobInterval: any = null;

let processJobInterval: any = null;
let spawnChild: any = getProcessAddon();
let result_list: any = [];

const processWssMap = new Map<string, Wss>();


export class SysProcessService {
    winAndLinuxGetProcess() {
        // let child = spawn(process.execPath,['./process.exe'],{shell:"cmd"});
        // 监听子进程的 stdout 流，并输出数据
        spawnChild.on("process", (data) => {
            if (!Array.isArray(data)) {
                return;
            }
            const list: any = [];
            for (const process of data) {
                // ID name USER MEM CPU
                list.push([process.id,
                    process.name,
                    process.user_name,
                    process.mem,
                    process.cpu ? process.cpu.toFixed(2) : 0]);
            }
            result_list = list;
            if (processWssMap.size === 0) {
                this.clear();
            }
        }, []);
    }

    linuxGetProcess() {
        let child = spawn('top', ['-b'], {
            env: {
                COLUMNS: '800' // 设置为所需宽度，比如 80
            }
        });
        spawnChild = child;
        // 监听子进程的 stdout 流，并输出数据
        child.stdout.on('data', (data) => {
            if (!data && !data.toString()) {
                return;
            }
            const rows = data.toString().split(/\n|\r\n/).filter(v => v.length > 5);
            const list: any[] = [];
            for (let i = 1; i < rows.length; i++) {
                const clumn = rows[i];
                const parts = clumn.split(" ").filter(v => v.length > 0);
                if (parts[0].includes("PID")) {
                    continue;
                }
                list.push([parts[0], parts[parts.length - 1], parts[1],
                    parts[5] * 1024 // kb换算成字节
                    , parts[8]])
            }
            result_list = list;
            if (processWssMap.size === 0) {
                this.clear();
            }
        });
        // 监听子进程的 stderr 流，并输出错误
        child.stderr.on('data', (data) => {
            console.error(`stderr: ${data.toString()}`);
            child.kill();
            this.clear();
        });
        child.on('error', (err) => {
            console.error('Error:', err);
            this.clear();
        });
        child.on('close', (code) => {
            this.clear();
            console.log(`child process exited with code ${code}`);
        });
    }

    async pushProcessInfo(wss: Wss, results: any) {
        const result = new WsData<SysPojo>(CmdType.process_getting);
        result.context = results;
        if (wss.ws.readyState === WebSocket.CLOSED) {
            throw "断开连接";
        }
        wss.sendData(result.encode())
    }

    private async openProcessPush(wss: Wss) {
        try {
            this.getProcessInfo();
            await this.pushProcessInfo(wss, result_list);
        } catch (e) {
            processWssMap.delete(wss.id);
            return;
        }
        if (!processJobInterval) {
            processJobInterval = setInterval(async () => {
                if (processWssMap.size === 0) {
                    clearInterval(processJobInterval);
                    processJobInterval = null;
                    this.killSpwn();
                    return;
                }
                const keys = processWssMap.keys();
                for (const socketId of keys) {
                    const wss = processWssMap.get(socketId)!;
                    try {
                        await this.pushProcessInfo(wss, result_list);
                    } catch (e) {
                        console.log(e)
                        console.log('系统信息推送失败进程')
                        if (wss) {
                            wss.ws.close();
                            processWssMap.delete(socketId);
                        }
                    }
                }
            }, 1000);
        }
    }

    private killSpwn() {
        const sys = getSys();
        if (sys === SysEnum.linux || sys == SysEnum.win) {
            spawnChild.close("process");
        } else {
            spawnChild.kill('SIGTERM');
            SystemUtil.killProcess(spawnChild.pid);
        }

    }

    private getProcessInfo() {
        try {
            if (sysJobInterval) {
                return;
            }
            const sys = getSys();
            this.winAndLinuxGetProcess();
            // if (sys === SysEnum.linux || sys == SysEnum.win) {
            //     this.winAndLinuxGetProcess();
            // } else {
            //     this.linuxGetProcess();
            // }
        } catch (e) {
            console.log(e)
            this.clear();
        }
    }

    private clear() {
        if (processJobInterval) {
            clearInterval(processJobInterval)
            processJobInterval = null;
        }
        this.killSpwn();
        processWssMap.clear();
    }

    async processGet(data: WsData<any>) {
        const id = (data.wss as Wss).id;
        if (processWssMap.get(id)) {
            return;
        }
        processWssMap.set((data.wss as Wss).id, (data.wss as Wss))
        await this.openProcessPush((data.wss as Wss));
    }


    async processClose(data: WsData<any>) {
        SystemUtil.killProcess(data.context.pid)
    }

}

export const SysProcessServiceImpl = new SysProcessService();
