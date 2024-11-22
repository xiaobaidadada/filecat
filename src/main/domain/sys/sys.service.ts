import si from "systeminformation";
import os from "os";
import {Sucess} from "../../other/Result";
import {DiskDevicePojo, DiskFilePojo} from "../../../common/req/sys.pojo";
import {formatFileSize} from "../../../common/ValueUtil";

export class SysService {
    async getSysIno() {
        const cpu = await si.cpu();
        const totalMemory = os.totalmem();
        return Sucess({
            mem_total: (totalMemory / (1024 * 1024 * 1024)).toFixed(2),
            cpu_manufacturer: cpu.manufacturer,
            cpu_brand: cpu.brand,
            cpu_core_num: cpu.cores,
            cpu_phy_core_num: cpu.physicalCores,
            cpu_speed_hz: cpu.speedMax,
            pid_ppid:`${process.pid};${process.ppid}`,
        })
    }

    async getDisk() {
        const disks = await si.diskLayout();
        const list:DiskDevicePojo[] = [];
        for (const disk of disks ?? []) {
            const pojo = new DiskDevicePojo();
            pojo.name = disk.device;
            pojo.typeName = disk.name;
            pojo.total = formatFileSize(disk.size);
            if (disk.type) {
                if (disk.type.includes("SD")) {
                    pojo.type = "固态";
                } else {
                    pojo.type = "机械";
                }
            }
            list.push(pojo);
        }
        return Sucess(list);
    }

    async getFileDisk() {
        const drives1 = await si.fsSize();
        const drives2 = await si.blockDevices();
        const map = new Map();
        for (const disk of drives1 ?? []) {
            map.set(disk.mount,disk);
        }
        const  list:DiskFilePojo[] = [];
        for (const disk of drives2 ?? []) {
            const pojo = new DiskFilePojo();
            const sizeInfo = map.get(disk.mount);
            pojo.name = disk.name;
            pojo.fsType = disk.fsType;
            pojo.mount = disk.mount;
            pojo.device_name = disk.device;
            if (sizeInfo) {
                pojo.total = formatFileSize(sizeInfo.size);
                pojo.available = formatFileSize(sizeInfo.available );
            }
            list.push(pojo);
            map.delete(disk.mount);
        }
        if (map.size > 0) {
            map.forEach(disk => {
                const pojo = new DiskFilePojo();
                pojo.name = disk.fs;
                pojo.fsType = disk.type;
                pojo.mount = disk.mount;
                pojo.total = formatFileSize(disk.size );
                pojo.available = formatFileSize(disk.available);
                list.push(pojo);
            })
        }
        return Sucess(list);
    }
}

export const SyserviceImpl = new SysService();
