import {CmdType, WsData} from "../../../common/frame/WsData";
import {systemdPojo} from "../../../common/req/setting.req";
import {DataUtil} from "../data/DataUtil";
import { getProcessAddon} from "../bin/bin";
import {Wss} from "../../../common/frame/ws.server";
import {SysPojo} from "../../../common/req/sys.pojo";
import {deleteList} from "../../../common/ListUtil";
import fs from "fs";
const { spawn ,execSync} = require('child_process');
import WebSocket from "ws";
const systemd_key = "systemd_key";

let  spawnChild = getProcessAddon();
const processWssSet = new Set<Wss>();
let jobInterval: any = null;
let result_list: any = [];
let service_names:string ="";
let pid_name_map__ = new Map();

//  这个只能用于linux系统
export class SysSystemdService {
    public  getAllSystemd() {
        const stdoutlist = execSync(`systemctl list-units --type=service --output=json`).toString();
        return  JSON.parse(stdoutlist);
    }
    public getAllInsideSystemd() {
        return DataUtil.get(systemd_key) ?? [];
    }
    public async addSystemd(unit_name:string) {
        const names:string[] = DataUtil.get(systemd_key) ?? [];
        for (const name of names) {
            if (name === unit_name) {
                return;
            }
        }
        names.push(unit_name);
        DataUtil.set(systemd_key,names);
        service_names = names.join(" ");
        this.getSytemdPids(names).then(data=>{
            const {pids,pid_name_map} = data;
            pid_name_map__ = pid_name_map;
            spawnChild.pids("systemd",pids);
        }).catch(e=>{
            console.log(e);
        })
    }
    public async deleteSystemd(unit_name:string) {
        const names:string[] = DataUtil.get(systemd_key) ?? [];
        deleteList(names,value=>value === unit_name);
        DataUtil.set(systemd_key,names);
        service_names = names.join(" ");
        this.getSytemdPids(names).then(data=>{
            const {pids,pid_name_map} = data;
            pid_name_map__ = pid_name_map;
            spawnChild.pids("systemd",pids);
        }).catch(e=>{
            console.log(e);
        })
    }

    // 每次都要重新获取，因为进程重新启动以后，pid会更改
    private async getSytemdPids(serviceNames:string[]) {
        const pid_name_map = new Map();
        const not_pid_names:string[] = [];
        const pids:number[] = [];
        const grepPattern = serviceNames.map(value => {
            value = value.trim();
            if(value.endsWith(".service")) {
                return value;
            } else {
                return value+".service";
            }
        }).join('|');
        const stdoutlist = execSync(`systemctl list-units --type=service | grep -E '${grepPattern}'`).toString();
        // 获取找到的服务列表
        const services = stdoutlist.split('\n').filter(line => line);
        services.forEach(service => {
            const list = service.split(/\s+/);
            // 提取服务名称
            let serviceName;
            // const serviceName = list.find(value => !!value); // 第一个不为空的元素
            for (let i=0;i<list.length;i++) {
                if (i>1) {
                    break;
                }
                const item = list[i];
                for (const name of serviceNames) {
                    if (item.includes(name)) {
                        serviceName = item;
                        break;
                    }
                }
                if (serviceName) {
                    break;
                }
            }
            if (!serviceName) {
                return;
            }
            const stdoutpid = execSync(`systemctl show ${serviceName} --property=MainPID`).toString();
            // 提取并显示 PID
            const pid = stdoutpid.split('=')[1].trim();
            if (pid && pid !== '0') {
                const id = parseInt(pid);
                pids.push(id);
                pid_name_map.set(id,serviceName);
            } else {
                not_pid_names.push(serviceName);
            }
        });
        return {pids,pid_name_map,not_pid_names};
    }

    private clear() {
        spawnChild.close("systemd");
        if (jobInterval) {
            clearInterval(jobInterval);
            jobInterval = null;
        }
        processWssSet.clear();
    }

    async systemdGet(data:WsData<any>) {
        processWssSet.add(data.wss as Wss);
        if (jobInterval) {
            return;
        }
        const names:string[] = DataUtil.get(systemd_key) ?? [];
        if (names.length === 0) {
            return;
        }
        service_names = names.join(" ");
        const {pids,pid_name_map,not_pid_names} = await this.getSytemdPids(names);
        pid_name_map__ = pid_name_map;
        spawnChild.on("systemd",(data) => {
            if (!Array.isArray(data)) {
                return;
            }
            const list:any[] = [];
            for (const process of data) {
                // ID name USER MEM CPU 最后再添加状态
                list.push([process.id,
                    pid_name_map__.get(process.id),
                    process.name,
                    process.user_name,
                    process.mem,
                    process.cpu?process.cpu.toFixed(2):0]);
            }
            for (const item of not_pid_names) {
                list.push([
                    0,
                    item,
                    "",
                    "",
                    0,
                    0
                ])
            }
            result_list = list;
            if (processWssSet.size === 0) {
                this.clear();
            }
        },pids);
    }
    private async pushInfo(wss: Wss, results: any,avtives:string[] ) {
        const r_list = [];
        results.forEach((list:any[], index) => {
            if(!avtives[index]) {
                return;
            }
            const list_p = [...list];
            const status = avtives[index].trim();
            list_p.push(status);
            r_list.push(list_p);
        });
        const result = new WsData<SysPojo>(CmdType.systemd_inside_getting);
        result.context = r_list;
        if (wss.ws.readyState ===WebSocket.CLOSED) {
            throw "断开连接";
        }
        wss.sendData(result.encode())
    }
    async systemdInsideGet(data:WsData<any>) {
        await this.systemdGet(data);
        if(!service_names) {
            return;
        }
        if (!jobInterval) {
            (data.wss as Wss).setClose(()=>{
                clearInterval(jobInterval);
                jobInterval = null;
                this.clear();
            })
            jobInterval = setInterval(async () => {
                if (processWssSet.size === 0) {
                    clearInterval(jobInterval);
                    jobInterval = null;
                    this.clear();
                    return;
                }
                const stdoutlist = execSync(`systemctl is-active  ${service_names}`).toString();
                const avtives:string[] = stdoutlist.trim().split('\n');
                for (const wss of processWssSet.values()) {
                    try {
                        await this.pushInfo(wss, result_list,avtives);
                    } catch (e) {
                        console.log('systemd推送失败systemd',e)
                        if (wss) {
                            wss.ws.close();
                            processWssSet.delete(wss);
                        }
                    }
                }
            }, 1000);
        }
    }


    async get_systemd_context(name:string) {
        const sdtout = execSync(`systemctl show ${name} --property=FragmentPath`).toString();
        const filePath = sdtout.split("=")[1].replaceAll("\n","");
        const buffer = fs.readFileSync(filePath);
        return {
            context:buffer.toString(),
            path:filePath
        };
    }


    async delete_sys_systemd(name:string) {
        const sdtout = execSync(`systemctl show ${name} --property=FragmentPath`).toString();
        const filePath = sdtout.split("=")[1].replaceAll("\n","");
        execSync(`sudo systemctl stop ${name}`);
        execSync(`sudo systemctl disable  ${name}`);
        execSync(`sudo rm ${filePath}`);
        execSync(`sudo systemctl daemon-reload`);
        execSync(`sudo systemctl reset-failed`);
        await this.deleteSystemd(name);
    }

    async systemd_logs_get(data: WsData<any>) {
        // const socketId = (data.wss as Wss).id;
        const pojo = data.context;
        let exec;
        try {
            // 创建
            exec = spawn('journalctl', ['-u', `${pojo.unit_name}`, '-f', '-n', 1000]);
            exec.stdout.on('data', (eData) => {
                const result = new WsData<SysPojo>(CmdType.systemd_logs_getting);
                result.context = eData.toString();
                (data.wss as Wss).sendData(result.encode())
            });
            exec.stderr.on('data', (eData) => {
                const result = new WsData<SysPojo>(CmdType.systemd_logs_getting);
                result.context = eData.toString();
                (data.wss as Wss).sendData(result.encode())
            });
            exec.on('close', (code) => {
                if (exec) {
                    console.log('意外断开exec systemd');
                    exec.kill();
                }
                (data.wss as Wss).ws.close();
            });
            (data.wss as Wss).ws.on('close', function close() {
                if (exec) {
                    console.log('意外断开exec  systemd');
                    exec.kill();
                }
                (data.wss as Wss).ws.close();
            });
        } catch (ex) {
            if (exec) {
                console.log('意外断开exec systemd');
                exec.kill();
                (data.wss as Wss).ws.close();
            }
        }

    }



}
export const systemd = new SysSystemdService();