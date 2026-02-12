
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
    user:string;
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
    ata_smart_attributes:any[][] = []; // 各个属性，是实时更新的，如果进行自检，会进行更深度详细的检查  值按diskCheckAttr的属性从前往后排

    nvme_smart?: {
        /**
         * 当前控制器温度（单位：摄氏度 ℃）
         *
         * - 来自 NVMe SMART / Health Information Log
         * - 通常是主控或最热点温度
         * - 长期 > 70℃ 可能触发降速或寿命下降
         */
        temperature: number;

        /**
         * 剩余可用备用块百分比（0–100）
         *
         * - 100 表示备用块完全充足
         * - 低于 available_spare_threshold 时：
         *   NVMe 会设置 critical_warning
         * - 越低表示 NAND 损耗越严重
         */
        available_spare: number;

        /**
         * 设备寿命已使用百分比（0–100）
         *
         * - 0   = 全新或几乎未磨损
         * - 100 = 达到设计寿命（不代表立刻损坏）
         * - >100 在部分厂商实现中可能继续增长
         * - 这是 NVMe 判断“SSD 磨损”的核心指标
         */
        percentage_used: number;

        /**
         * 主机读取的数据量（单位：Data Unit）
         *
         * - 1 Data Unit = 512,000 字节（≈ 500 KB）
         * - 这是逻辑读入量，不是 NAND 实际读
         * - 可用于统计读负载
         */
        data_units_read: number;

        /**
         * 主机写入的数据量（单位：Data Unit）
         *
         * - 1 Data Unit = 512,000 字节（≈ 500 KB）
         * - 是 SSD 寿命消耗的重要参考
         * - 与 TBW（Total Bytes Written）强相关
         */
        data_units_written: number;

        /**
         * 上电次数
         *
         * - 包含正常开机、重启
         * - 不包含睡眠 / 低功耗状态切换
         */
        power_cycles: number;

        /**
         * 累计通电时间（单位：小时）
         *
         * - 从设备首次通电开始累计
         * - 不会因断电清零
         */
        power_on_hours: number;

        /**
         * 非正常关机次数
         *
         * - 例如：突然断电、系统崩溃、强制关机
         * - 次数多可能增加数据损坏风险
         */
        unsafe_shutdowns: number;

        /**
         * 媒体错误计数
         *
         * - 表示发生过不可恢复的 NAND 读写错误
         * - 非 0 通常意味着硬件层面已出现问题
         * - 是 NVMe 中最严重的健康信号之一
         */
        media_errors: number;

        /**
         * 错误日志条目数
         *
         * - 记录在 NVMe Error Log 中的错误条目数量
         * - 包含命令失败、超时等控制器级错误
         * - 不一定都是致命错误，但异常增多需关注
         */
        num_err_log_entries: number;
    };

}


// 执行系统上的命令
export enum SysCmd {
    mount
}

export class  SysCmdExePojo {
    type:SysCmd;
}

/**
 * Node.js 进程内存使用情况（单位：字节）
 * 来源：process.memoryUsage()
 */
export class node_memory_usage {

    /**
     * Resident Set Size
     * 进程实际占用的物理内存总量（最接近操作系统看到的内存）
     *
     * 包含：
     * - V8 堆内存
     * - C++ 扩展模块内存
     * - Buffer / ArrayBuffer
     * - 线程栈
     * - native 库（如 sqlite、wasm、OpenSSL 等）
     *
     * ⭐ 通常用于判断进程真实内存占用
     */
    rss: number;

    /**
     * V8 已申请的堆总内存
     *
     * 表示 JS 引擎当前向系统申请的堆空间总量
     * heapUsed 一定小于等于该值
     */
    heapTotal: number;

    /**
     * V8 当前已使用的堆内存
     *
     * 表示 JS 对象实际占用的内存
     * ⭐ 判断 JS 内存泄漏时重点关注该值
     */
    heapUsed: number;

    /**
     * V8 堆外内存
     *
     * 包含：
     * - C++ 对象
     * - native 插件
     * - 某些 Buffer
     * - wasm 内存
     *
     * ⭐ AI / 文件处理 / 向量库场景非常重要
     */
    external: number;

    /**
     * ArrayBuffer / SharedArrayBuffer 占用内存
     *
     * 属于 external 的子集
     * 主要来自：
     * - Node Buffer
     * - 二进制数据处理
     */
    arrayBuffers: number;
}
