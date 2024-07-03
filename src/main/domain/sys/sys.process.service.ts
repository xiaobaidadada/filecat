import {CmdType, WsData} from "../../../common/frame/WsData";
import {Wss} from "../../../common/frame/ws.server";
import {sysType} from "../shell/shell.service";
import {SystemUtil} from "./sys.utl";
import { spawn} from "child_process";
import {SysPojo} from "../../../common/req/sys.pojo";
import {StringUtil} from "../../../common/StringUtil";
import path from "path";

let sysJobInterval: any = null;

let processJobInterval: any = null;
let spawnChild: any = null;
let result_list: any = [];

const processWssMap = new Map<string, Wss>();


const { createRequire } = require('node:module');
export const require_c = createRequire(__filename);

export class SysProcessService {
    winGetProcess() {
        // let child = spawn(process.execPath,['./process.exe'],{shell:"cmd"});
        let child = require_c(path.join(__dirname,'win-process.node'));
        spawnChild = child;
        // 监听子进程的 stdout 流，并输出数据
        child.on((data) => {
            if (!Array.isArray(data)) {
                return;
            }
            result_list = [];
            const list:any = [];
            for (const process of data) {
                // ID name USER MEM CPU
                list.push([process.id,
                    process.name,
                    process.user_name,
                    process.mem,
                    process.cpu?process.cpu.toFixed(2):0]);
            }
            result_list = list;
            if (processWssMap.size === 0) {
                this.clear();
            }
        });
    }

    linuxGetProcess() {
        let child = spawn('top',['-b'],{
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
            const rows= data.toString().split(/\n|\r\n/).filter(v => v.length > 5);
            const  list:any[] = [];
            for (let i = 1; i < rows.length; i++) {
                const clumn = rows[i];
                const parts = clumn.split(" ").filter(v => v.length > 0);
                if (parts[0].includes("PID")) {
                    continue;
                }
                list.push([parts[0],parts[parts.length-1],parts[1],
                    parts[5] * 1024 // kb换算成字节
                    ,parts[8]])
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
            console.log(`child process exited with code ${code}`);
        });
    }

    async pushProcessInfo(wss: Wss, results: any) {
        const result = new WsData<SysPojo>(CmdType.process_getting);
        result.context = results;
        if (wss.ws.readyState !== 1) {
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
                        console.log('系统信息推送失败docker')
                        clearInterval(sysJobInterval);
                        sysJobInterval = null;
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
        if (spawnChild) {
            SystemUtil.killProcess(spawnChild.pid);
            spawnChild = null;
        }
    }

    private getProcessInfo() {
        try {
            if (spawnChild) {
                return;
            }
            if (sysType === 'win') {
                this.winGetProcess();
            } else {
                this.linuxGetProcess();
            }
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

    async processCancel(data: WsData<any>) {
        const id = (data.wss as Wss).id;
        processWssMap.delete(id);
        (data.wss as Wss).ws.close();
    }

    async processClose(data: WsData<any>) {
        SystemUtil.killProcess(data.context.pid)
    }

}

export const SysProcessServiceImpl = new SysProcessService();
