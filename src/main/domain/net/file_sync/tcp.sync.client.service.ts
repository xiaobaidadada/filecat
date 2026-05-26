import path from "path";
import fs from "fs";
import fse from "fs-extra";
import { tcp_proxy_client_fig, tcp_proxy_sync_task_item } from "../../../../common/req/common.pojo";
import { NetClientUtil } from "../util/NetClientUtil";
import { NetMsgType } from "../util/NetUtil";
import {
    buildSyncEnvelope, cache_file_type,
    createSyncIgnoreMatcher,
    normalizeSyncRelativePath,
    parseSyncEnvelope,
    safeResolveSyncPath, SyncRuntimeState
} from "./tcp.sync.util";
import { tcp_forward_client_service } from "../tcp.forward.client.service";
import { DataUtil } from "../../data/DataUtil";
import { data_dir_tem_name } from "../../data/data_type";
import { FileUtil } from "../../file/FileUtil";
import {start_worker_threads, ThreadsFilecat} from "../../../threads/filecat/threads.filecat";
import {threads_msg_type} from "../../../threads/threads.type";



function getClientById(client_num_id: number) {
    return tcp_forward_client_service.client_fig_get().list.find((item) => item.client_num_id === client_num_id);
}

function getServerConnectionForClient(client_num_id: number) {
    const fig = getClientById(client_num_id);
    if (!fig) {
        return null;
    }
    return NetClientUtil.get_server_socket(fig.serverIp, fig.serverPort);
}

export class TcpSyncClientService {

    async client_sync_task_get() {
        if(!ThreadsFilecat.is_running) {
            return  []
        }
        const list = await ThreadsFilecat.post(threads_msg_type.file_watch_sync_task_get,{})
        return list
    }

    private shouldManageTask(task: tcp_proxy_sync_task_item, client_num_id: number) {
        return task.source_client_num_id === client_num_id || task.target_client_num_id === client_num_id;
    }



    public stopRuntime(task_id: string) {
        if(!ThreadsFilecat.is_running) return
       // 没有必要吧
        ThreadsFilecat.post(threads_msg_type.file_watch_close,{task_id}).catch(console.error);
    }


    public async open_task(task: tcp_proxy_sync_task_item, client_num_id: number) {
        if (!this.shouldManageTask(task, client_num_id) || !task.open) {
            return;
        }
        start_worker_threads()

        const cache_path = DataUtil.get_file_path(data_dir_tem_name.tempfile, `tcp_proxy_file_sync_${task.id}.json`);
        ThreadsFilecat.post(threads_msg_type.file_watch_init,{
            task,client_num_id,cache_path
        },10_000).catch(console.error)

    }


    // 响应和接收远端网络包的回调钩子
    public async apply_remote_event(buffer: Buffer) {
        if(!ThreadsFilecat.is_running) return

        // 向子线程 post 消息时传入转移列表
        await ThreadsFilecat.post(
            threads_msg_type.file_watch_apply,
            { buffer },
            2000
        );
    }


    public async sync_task_config(task: tcp_proxy_sync_task_item, client_num_id: number) {
        await this.open_task(task, client_num_id);
    }

    public sync_task_clear(task_id: string) {
        // 删除缓存文件
        this.stopRuntime(task_id);
    }

    public tcp_sync_task_config_delete(task_id: string) {
        // 删除缓存文件
        this.sync_task_clear(task_id);
        const cache_path = DataUtil.get_file_path(data_dir_tem_name.tempfile, `tcp_proxy_file_sync_${task_id}.json`);
        FileUtil.unlinkSync(cache_path).catch(console.error);
    }

    async send_data(current_client_id:number,buffer:any) {
        const serverSocket = getServerConnectionForClient(current_client_id);
        const rawClient = serverSocket?.get_raw_client?.();
        if (!rawClient?.connected) return;

        await serverSocket.send_data_async(NetMsgType.tcp_sync_task_event, buffer);

    }
}

export const tcpSyncClientService = new TcpSyncClientService();

ThreadsFilecat.on_message('message', (msg)=>{
    const { type  } = msg
    if(type === threads_msg_type.file_watch_send) {
        const {current_client_id,buffer} = msg.data
        tcpSyncClientService.send_data(current_client_id, buffer).catch(console.error);
    }
})