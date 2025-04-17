export class NetPojo {
    // 要代理的url
    targetProxyUrl: string;
    // 返回给浏览器的代理端口
    proxyPort: number;
    // 系统代理端口
    sysProxyPort: number;
}

export enum VirServerEnum {
    tcp,
    udp
}

export class VirServerPojo {
    open: boolean = false; // 开启状态

    port:number; // 服务器的端口
    key:string = ""; // 通信密钥
    // udp_port:number = 888; // udp 暂时放弃
}

export class VirClientPojo {
    client_name: string;
    open: boolean = false;
    ip:string;
    mask:number;
    serverIp:string;
    serverPort:number;
    key:string = "";
    model:VirServerEnum = VirServerEnum.udp; // 运行模式
}

export class VirNetItem {
    vir_ip:string;
    real_ip:string;
    online:boolean = false;
}


export interface HttpFormData {
    key: string;
    value: string; // 值如果是文件 这个值没有意义
    // 下面是有文件的时候才有意义的
    is_file?: boolean;
    fullPath?: string; // 临时名字
    fileName?: string; // 实际名字
    file_object?: any // 临时的 服务端不保存

}
export enum http_body_type {
    row = 1,
    json = 2,
    form = 3,

}
export class HttpFormPojo {
    body_type:http_body_type;
    header_type:number; // 1 请求头 2 请求体
    url:string;
    method:string;
    headers:any;
    // 字符串数据
    data:string;
    // json 数据
    json_data:string;
    // 表单数据
    // form_data:{[key:string]:HttpFormData} | string;
    form_data_list :HttpFormData[] | string;
    local_download_path:string; // 本地下载地址

}

export class http_download_map {
    seep?:any; // 下载速度
    // last_load_time:number, // 上一次的统计时间
    loaded:number; // 已下载的大小
    progresses?:any; // 进度百分比
    last_loaded:number; // 上一秒统计时候的大小
    total?:number; // 总大小
    filename:string; // 文件名字
    local_download_path:string; // 实际文件地址
}


export class TcpPorxyITem {
    index:number;
    port:number;
    target_port:number;
    target_ip:string;
    open:boolean;
    status:boolean;
    note:string;
}
