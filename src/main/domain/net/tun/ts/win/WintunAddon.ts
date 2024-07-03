import * as path from "node:path";
import {sysType} from "../../../../shell/shell.service";
import {require_c} from "../../../../sys/sys.process.service";

export interface WintunAddonTypes {
    /**
     * 初始化wintun 并返回 wintun句柄
     */
    wintunInit: () => Buffer;

    /**
     * 设置Ip并返回适配器
     * @param name 适配器名字
     * @param ip ip
     * @param mask ip的掩码
     */
    wintunSetIpv4AndGetAdapter: (name: string,ip:string,mask:number) => Buffer;

    /**
     * 通过适配器句柄获取会话句柄
     * @param adapterHandle 会话句柄
     */
    wintunGetSession: (adapterHandle:Buffer) => Buffer;

    /**
     *  开始，并监适配器ip包数据，并返回线程句柄
     * @param sessionHandle
     * @param handler
     */
    wintunUpOn: (sessionHandle: Buffer,handler:(data:Buffer)=>void) => boolean;

    /**
     * 关闭所有句柄
     * @param threadHandle
     * @param adapter
     * @param Session
     * @param Wintun
     */
    wintunClose: (adapter:Buffer,Session:Buffer,Wintun:Buffer) => number;

    /**
     * 发送数据到网卡session
     * @param Session
     * @param data
     */
    wintunSend: (Session:Buffer,data:Buffer) => number;

    /**
     * 设置dll路径
     * @param dllPath
     */
    wintunSetPath(dllPath:string) : void;

}


const WintunAddon: WintunAddonTypes = sysType==='win'?require_c(path.join(__dirname,"wintun.node")):null;
export default WintunAddon;
