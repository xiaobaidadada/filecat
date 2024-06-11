import si from "systeminformation";
import os from "os";
import {Sucess} from "../../other/Result";

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
            cpu_speed_hz: cpu.speedmax
        })
    }
}

export const SyserviceImpl = new SysService();