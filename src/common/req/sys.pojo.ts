
export interface SysPojo {
    mem_total:number,
    mem_left:number,
    cpu_currentLoad:number,
}

export interface staticSysPojo {
    mem_total:number,
    cpu_manufacturer:string
    cpu_brand:string,
    cpu_core_num:number,
    cpu_phy_core_num:number
    cpu_speed_hz:number
}

// 物理信息
export class DiskDevicePojo {
    typeName:string; // 厂商给的名称
    name:string;
    type:string; // 固态机械
    total:any;
}
export class DiskFilePojo {
    name:string;
    fsType:string; // 文件系统类型
    mount:string; // 挂载位置
    device_name:string; // 物理硬盘名字
    total:any;
    available:any;
}
