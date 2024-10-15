import {CmdType, WsData} from "../../../common/frame/WsData";
import si from "systeminformation";
import os from "os";
import WebSocket from "ws";
const fs = require('fs');
import {diskCheckAttr, DiskCheckInfo, SysCmd, SysCmdExePojo, SysPojo} from "../../../common/req/sys.pojo";
import {Wss} from "../../../common/frame/ws.server";
import {execSync} from "child_process";
import {get_ntfs_3g, getSmartctl} from "../bin/bin";
import {lv_item, pv_item, vg_item} from "../../../common/req/common.pojo";
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
        if (wss.ws.readyState ===WebSocket.CLOSED) {
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

    public async diskSmartctl(disk:string) {
        const result = new DiskCheckInfo();
        const jsonstr = execSync(`${getSmartctl()} -a --json ${disk}`).toString();
        const pojo = JSON.parse(jsonstr);
        result.model_name = pojo["model_name"];
        result.serial_number = pojo["serial_number"];
        result.firmware_version = pojo["firmware_version"];
        result.rotation_rate = pojo["rotation_rate"];
        if (pojo["smart_status"]) {
            result.smart_status = pojo["smart_status"].passed;
        }
        result.power_cycle_count = pojo["power_cycle_count"];
        if(pojo["power_on_time"]) {
            result.power_on_time_hours = pojo["power_on_time"].hours;
        }
        if(pojo["temperature"]) {
            result.temperature = pojo["temperature"].current;
        }
        if(pojo["device"]) {
            result.device_protocol = pojo["device"].protocol;
        }
        if(pojo["ata_smart_attributes"] && pojo["ata_smart_attributes"].table) {
            const ata_smart_attributes:any[][] = [];
            for (const value of pojo["ata_smart_attributes"].table) {
                ata_smart_attributes.push([value.name,
                    value.value,
                    value.worst,
                    value.thresh])
            }
            result.ata_smart_attributes = ata_smart_attributes;
        }
        return  result;
    }


    public get_lsblk_info() {
        const jsonstr = execSync(`  lsblk --output-all --json`).toString();
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

    public get_lvm_info() {
        const pojo_list:vg_item[] = [];
        const vg_list = JSON.parse(execSync(`  vgs  --reportformat json`).toString()).report[0].vg;
        for (const item of vg_list) {
            const pojo = new vg_item();
            pojo.name = item.vg_name;
            pojo.size = item.vg_size;
            pojo.lv_count = item.lv_count;
            pojo.pv_cout = item.pv_count;
            pojo.free_size = item.vg_free;
            const pvs = JSON.parse(execSync(`pvs --select vg_name=${item.vg_name} --reportformat json`).toString()).report[0].pv;
            for (const item1 of pvs ??[]) {
                pojo.pv_list.push({
                    name:item1.pv_name,
                    free_size:item1.pv_free,
                    size:item1.pv_size
                })
            }
            const lvs = JSON.parse(execSync(`lvs  --select vg_name=${item.vg_name} --reportformat json`).toString()).report[0].lv;
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


    cmd_exe(pojo:SysCmdExePojo) {
        switch (pojo.type) {
            case SysCmd.mount:
                execSync("sudo mount -a");
                break;
            default:
                break;
        }
    }

}

export const SysSystemServiceImpl = new SysSystemService();
