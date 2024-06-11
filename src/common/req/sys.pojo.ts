
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