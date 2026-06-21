import {CmdType, WsData} from "./WsData";

export interface wss_interface {


    dataMap: Map<any, any>;
    id: string;
    _close: Function[]
    token: string;
    heart_time_stamp: number
    heart_interval: NodeJS.Timeout;

    readonly ws: any;

    sendData:(data: any)=>void

    send:(cmdType:CmdType,data:any)=>void

    setClose:(close: Function)=>void
}