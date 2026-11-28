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
                // 先采集一次，再广播给所有连接。
                // 原来是每个连接各跑一遍 si.mem()（单次约 18ms），
                // 开 3 个面板就白跑 3 遍
                let encoded: Uint8Array;
                try {
                    const data = await this.collectSysInfo();
                    // 同一份载荷发给所有连接，编码一次就够
                    encoded = new WsData<SysPojo>(CmdType.sys_getting, data).encode();
                } catch (e) {
                    console.log('系统信息采集失败,原因：', e);
                    return;
                }
                for (const [socketId, conn] of sysWssMap) {
                    try {
                        conn.sendData(encoded);
                    } catch (e) {
                        console.log('系统信息推送失败sys,原因：', e);
                        sysWssMap.delete(socketId);
                    }
                }
            }, 2000);
        } else {
            // 新连上来的先给一份当前的，不用等下一个周期
            try {
                const data = await this.collectSysInfo();
                wss.sendData(new WsData<SysPojo>(CmdType.sys_getting, data).encode());
            } catch (e) {
                sysWssMap.delete(wss.id);
            }
        }
    }

    // 用于存储上一次CPU时间
    private lastNodeCpuUsage: number | null = null;
    private lastNodeCpuStamp: number | null = null;

    /** 采集一次系统信息，供广播复用（不涉及任何连接） */
    async collectSysInfo(): Promise<SysPojo> {
        const currentLoad = await si.currentLoad();
        // macOS 的 os.freemem() 只统计「从未被使用」的页，系统把绝大部分空闲内存
        // 当成文件缓存（inactive / speculative）不算进去，16G 机器常年只有几十 MB，
        // 面板就成了永远 100%。si.mem().available 已经把可回收缓存算进来，
        // 三平台语义一致，直接用它。
        const mem = await si.mem();
        // 磁盘/网络的速率由 si 自己按两次采样的差值算好，单位字节/秒，
        // 首次调用返回 -1（没有上一份基准），统一归零
        const [fs_stats, net_stats] = await Promise.all([si.fsStats(), si.networkStats()]);
        const pick = (v: number | null | undefined) => (v && v > 0 ? v : 0);
        let disk_read_sec = 0, disk_write_sec = 0;
        if (fs_stats) {
            disk_read_sec = pick(fs_stats.rx_sec);
            disk_write_sec = pick(fs_stats.wx_sec);
        }
        let net_rx_sec = 0, net_tx_sec = 0;
        for (const item of net_stats || []) {
            net_rx_sec += pick(item.rx_sec);
            net_tx_sec += pick(item.tx_sec);
        }

        // ===== FileCat 进程自身的 CPU 使用率 =====
        // process.cpuUsage() 返回的是累计 CPU 时间（微秒），不是使用率。
        // 要用「本次差值 / 实际流逝的墙钟时间 / 核数」才是真正的占用比。
        // 原来算成 (本次累计 - 上次累计) / 上次累计，进程跑得越久数字越小，
        // 跟忙不忙毫无关系，是个假指标。
        const cpu_usage_now = process.cpuUsage();
        const cpu_used_now = cpu_usage_now.user + cpu_usage_now.system; // 微秒
        const stamp_now = Date.now();
        let node_cpu_usage = 0;
        if (this.lastNodeCpuUsage !== null && this.lastNodeCpuStamp !== null) {
            // 微秒差 / (毫秒差 * 1000) = 占单核的比例，再除以核数得占整机的比例
            const used_delta = cpu_used_now - this.lastNodeCpuUsage;
            const elapsed_us = (stamp_now - this.lastNodeCpuStamp) * 1000;
            const core_num = Math.max(1, os.cpus().length);
            if (elapsed_us > 0) {
                // 夹在 0~100，防止采样抖动导致越界
                node_cpu_usage = Math.min(100, Math.max(0, (used_delta / elapsed_us / core_num) * 100));
            }
        }
        this.lastNodeCpuUsage = cpu_used_now;
        this.lastNodeCpuStamp = stamp_now;

        return {
            memTotal: (mem.total / (1024 * 1024 * 1024)).toFixed(2),
            memLeft: (mem.available / (1024 * 1024 * 1024)).toFixed(2),
            cpu_currentLoad: Number(currentLoad.currentLoad.toFixed(2)),
            disk_read_sec,
            disk_write_sec,
            net_rx_sec,
            net_tx_sec,
            // 下面几个是内部字段，前端按需取用
            node_memory_usage: process.memoryUsage(),
            node_cpu_usage: node_cpu_usage.toFixed(2),
        } as SysPojo;
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
            const jsonstr = (await SystemUtil.execAsync(`${await settingService.getSmartctl()} -a --json ${disk}`)).toString();
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
