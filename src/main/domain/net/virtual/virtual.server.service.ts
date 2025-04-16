import {VirServerEnum, VirServerPojo} from "../../../../common/req/net.pojo";
import {DataUtil} from "../../data/DataUtil";
import {
    CLientInfo,
    vir_data_server_hash_key,
    vir_server_data_key,
    virtualClientService
} from "./virtual.client.service";
import dgram from "dgram";
import net from "net";
import {TcpUtil} from "../util/tcp.util";
import {Wss} from "../../../../common/frame/ws.server";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {NetServerUtil} from "../util/NetServerUtil";
import {clientMap} from "./virtual.controller";
import {NetClientUtil} from "../util/NetClientUtil";
import {NetUtil} from "../util/NetUtil";

class VirtualServerService {

    serverStatus: boolean = false;

    wssSet:Set<Wss> = new Set();

    get_all_client_info() {
        const list:any[] = [];
        clientMap.forEach(v=>{
            list.push([v.client_name,v.vir_ip,v.tcp_real_address,v?.tcpUtil.is_alive ?"在线":"离线"])
        })
        return list;
    }
    getServerInfos(data: WsData<any>) {
        const wss = data.wss as Wss;
        this.wssSet.add(wss);
        wss.setClose(()=>{
            this.wssSet.delete(wss);
        })
        return this.get_all_client_info();
    }

    // 推送最新连接
    pushConnectInfo() {
        const list = this.get_all_client_info();
        for (const wss of this.wssSet.values()) {
            wss.send(CmdType.vir_net_serverIno_get, list);
        }
    }

    public async virServerSave(data: VirServerPojo) {
        DataUtil.set(vir_server_data_key, data);
        const hashKey = NetUtil.get64Key(data.key);
        DataUtil.set(vir_data_server_hash_key, hashKey);
        if (data.open) {
            if (this.serverStatus) {
                return;
            }
            await this.tcpServerStart(data.port);
            // if(data.udp_port)
            // await this.udpServerStart(data.udp_port);
            this.serverStatus = true;
        } else {
            try {
                NetServerUtil.close_server();
            } catch (e) {
                console.log('虚拟网络关闭')
            }
            this.serverStatus = false;

        }
    }

    public virServerGet(): VirServerPojo {
        let pojo: VirServerPojo = DataUtil.get(vir_server_data_key);
        if (pojo) {
            return pojo;
        }
        pojo = new VirServerPojo();
        DataUtil.set(vir_server_data_key, pojo);
        return pojo;
    }

    public async udpServerStart(port?: number) {
        await NetClientUtil.start_dup_client(port);
    }


    public async tcpServerStart(port: number) {
        return NetServerUtil.start_tcp_server(port);
    }
}

export const virtualServerService = new VirtualServerService();
