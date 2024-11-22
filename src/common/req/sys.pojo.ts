
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
    pid_ppid:string;
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

export class diskCheckAttr {
    name:string;
    value:number; // 当前值
    worst:number; // 最坏值，越小越坏
    thresh:number; // 临界最小值
    // 错误时间
}

export class DiskCheckInfo {
    model_name?:string; // 设备型号
    serial_number?:string; //唯一序列号
    firmware_version?:string; //固件版本
    smart_status?:boolean;  // 是否健康
    rotation_rate?:number; // 分钟转速
    power_on_time_hours?:number; // 通电时常
    power_cycle_count?:number;  // 通电次数
    temperature?:number; // 当前温度 摄氏度（°C）
    // smart_support?:boolean; // 是否支持 SMART(硬盘联合制造商的标准)
    device_protocol?:string; // 通信协议
    ata_smart_attributes:any[][]; // 各个属性，是实时更新的，如果进行自检，会进行更深度详细的检查  值按diskCheckAttr的属性从前往后排
}


// 执行系统上的命令
export enum SysCmd {
    mount
}

export class  SysCmdExePojo {
    type:SysCmd;
}