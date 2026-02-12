import {CmdType, WsData} from "../../../common/frame/WsData";
import si from "systeminformation";
import os from "os";
import WebSocket from "ws";
const fs = require('fs');
import {
    diskCheckAttr,
    DiskCheckInfo,
    node_memory_usage,
    SysCmd,
    SysCmdExePojo,
    SysPojo
} from "../../../common/req/sys.pojo";
import {Wss} from "../../../common/frame/ws.server";
import {lv_item, pv_item, vg_item} from "../../../common/req/common.pojo";
import {SystemUtil} from "./sys.utl";
import {ThreadsFilecat} from "../../threads/filecat/threads.filecat";
import {threads_msg_type, WorkerMessage} from "../../threads/threads.type";
import {Worker as NodeWorker} from "worker_threads";
import {settingService} from "../setting/setting.service";
let sysJobInterval: any = null;

export const sysWssMap = new Map<string, Wss>();

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
                        console.log('系统信息推送失败sys,原因：',e)
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

    // 用于存储上一次CPU时间
    private lastNodeCpuUsage: number | null = null;
    private node_memory_usage_worker:node_memory_usage = {} as node_memory_usage

    async pushSysInfo(wss: Wss) {
        if(ThreadsFilecat.is_running) {
            ThreadsFilecat.emit(threads_msg_type.sys_info,{})
            ThreadsFilecat.on_once_msg(threads_msg_type.sys_info_send,(msg: WorkerMessage, worker: NodeWorker)=>{
                const {node_memory_usage} = msg.data
                if(node_memory_usage)  {
                    for (const key of Object.keys(node_memory_usage)) {
                        this.node_memory_usage_worker[key] = node_memory_usage[key]
                    }
                }
            })
        }
        const currentLoad = await si.currentLoad();
        // 获取总内存（单位：字节）
        const totalMemory = os.totalmem();
        // 剩余（单位：字节）
        const freeMemory = os.freemem();
        const result = new WsData<SysPojo>(CmdType.sys_getting);

        // ===== Node CPU 增长率（相对于自己上次调用） =====
        // Node 自身 CPU 用户态时间（微秒）
        const currentCpuUsage = process.cpuUsage();
        const userCpu = currentCpuUsage.user+currentCpuUsage.system;

        let nodeCpuGrowthRate = 0;

        if (this.lastNodeCpuUsage !== null && this.lastNodeCpuUsage !== 0) {
            nodeCpuGrowthRate = ((userCpu - this.lastNodeCpuUsage) / this.lastNodeCpuUsage) * 100;
        }
        // 更新上一次 CPU
        this.lastNodeCpuUsage = userCpu;
        const node_memory_usage_ = process.memoryUsage()
        for (const key of Object.keys(node_memory_usage_)) {
            node_memory_usage_[key] = this.node_memory_usage_worker[key]??0;
        }
        result.context = {
            memTotal: (totalMemory / (1024 * 1024 * 1024)).toFixed(2),
            memLeft: (freeMemory / (1024 * 1024 * 1024)).toFixed(2),
            cpu_currentLoad: currentLoad.currentLoad.toFixed(2),
            node_memory_usage: node_memory_usage_,
            node_cpu_usage: nodeCpuGrowthRate.toFixed(2),
        };
        // if (wss.ws.readyState ===WebSocket.CLOSED) {
        //     throw  "断开连接";
        // }
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

    public async diskSmartctl(disk: string) {
        const result = new DiskCheckInfo();
        let pojo: any;

        if (disk.includes(" ")) {
            throw "error params";
        }

        try {
            const jsonstr = (await SystemUtil.execAsync(`${settingService.getSmartctl()} -a --json ${disk}`)).toString();
            pojo = JSON.parse(jsonstr);
        } catch (e: any) {
            if (e.status === 4 && e.stdout) {
                // 内容过长
                pojo = JSON.parse(e.stdout);
            } else {
                throw e;
            }
        }

        /* ========= 基础通用信息 ========= */
        result.model_name = pojo.model_name;
        result.serial_number = pojo.serial_number;
        result.firmware_version = pojo.firmware_version;
        result.rotation_rate = pojo.rotation_rate;

        if (pojo.smart_status) {
            result.smart_status = pojo.smart_status.passed;
        }

        if (pojo.power_cycle_count !== undefined) {
            result.power_cycle_count = pojo.power_cycle_count;
        }

        if (pojo.power_on_time) {
            result.power_on_time_hours = pojo.power_on_time.hours;
        }

        if (pojo.temperature) {
            result.temperature = pojo.temperature.current;
        }

        if (pojo.device) {
            result.device_protocol = pojo.device.protocol;
        }

        /* ========= ATA / SATA ========= */
        if (
            pojo.device?.protocol === "ATA" &&
            pojo.ata_smart_attributes?.table
        ) {
            const ata_smart_attributes: any[][] = [];

            for (const value of pojo.ata_smart_attributes.table) {
                ata_smart_attributes.push([
                    value.name,
                    value.value,
                    value.worst,
                    value.thresh
                ]);
            }

            result.ata_smart_attributes = ata_smart_attributes;
        }

        /* ========= NVMe ========= */
        if (
            pojo.device?.protocol === "NVMe" &&
            pojo.nvme_smart_health_information_log
        ) {
            const nvme = pojo.nvme_smart_health_information_log;

            result.nvme_smart = {
                temperature: nvme.temperature,
                available_spare: nvme.available_spare,
                percentage_used: nvme.percentage_used,
                data_units_read: nvme.data_units_read,
                data_units_written: nvme.data_units_written,
                power_cycles: nvme.power_cycles,
                power_on_hours: nvme.power_on_hours,
                unsafe_shutdowns: nvme.unsafe_shutdowns,
                media_errors: nvme.media_errors,
                num_err_log_entries: nvme.num_err_log_entries
            };
        }

        return result;
    }



    public async get_lsblk_info() {
        const jsonstr = (await SystemUtil.execAsync(`  lsblk --output-all --json`)).toString();
        const list = JSON.parse(jsonstr);
        const left_list = [];
        for (const v of list['blockdevices'] ?? []) {
            if(v.type === "disk") {
                // fsTpye 是分区的文件系统类型 LVM2_member 是 LVM 的pv
                // u盘 硬盘 type 都是disk 逻辑卷 是 lvm
                // 逻辑卷扩容以后，还需要用resize2fs /dev/ubuntu-vg/ubuntu-lv (不同类型的系统使用的命令不同)
                // 卷组，相关的信息，要单独展示。
                left_list.push(v);
            }
        }
        return left_list;
    }

    public async get_lvm_info() {
        const pojo_list:vg_item[] = [];
        const vg_list = JSON.parse(
            (await SystemUtil.execAsync(`  vgs  --reportformat json`))
                .toString()
        ).report[0].vg;
        for (const item of vg_list) {
            const pojo = new vg_item();
            pojo.name = item.vg_name;
            pojo.size = item.vg_size;
            pojo.lv_count = item.lv_count;
            pojo.pv_cout = item.pv_count;
            pojo.free_size = item.vg_free;
            const pvs = JSON.parse(
                (await SystemUtil.execAsync(`pvs --select vg_name=${item.vg_name} --reportformat json`))
                    .toString()
            ).report[0].pv;
            for (const item1 of pvs ??[]) {
                pojo.pv_list.push({
                    name:item1.pv_name,
                    free_size:item1.pv_free,
                    size:item1.pv_size
                })
            }
            const lvs = JSON.parse(
                (await SystemUtil.execAsync(`lvs  --select vg_name=${item.vg_name} --reportformat json`))
                    .toString()
            ).report[0].lv;
            for (const item1 of lvs ??[]) {
                pojo.lv_list.push({
                    name:item1.lv_name,
                    size:item1.lv_size
                })
            }
            pojo_list.push(pojo);
        }
        return pojo_list;
    }


    async cmd_exe(pojo:SysCmdExePojo) {
        switch (pojo.type) {
            case SysCmd.mount:
                await SystemUtil.execAsync("sudo mount -a");
                break;
            default:
                break;
        }
    }

}

export const SysSystemServiceImpl = new SysSystemService();
