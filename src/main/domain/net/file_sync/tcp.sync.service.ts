import {DataUtil} from "../../data/DataUtil";
import {data_common_key, file_key} from "../../data/data_type";
import {tcp_proxy_sync_task_item, tcp_proxy_server_client} from "../../../../common/req/common.pojo";
import {generateSaltyUUID} from "../../../../common/StringUtil";
import {NetMsgType, NetUtil} from "../util/NetUtil";
import {buildSyncEnvelope, parseSyncEnvelope} from "./tcp.sync.util";
import path from "path";
import {tcpForwardService} from "../tcp.forward.server.service";



function getClientList(): tcp_proxy_server_client[] {
    return DataUtil.get(data_common_key.tcp_proxy_server_client_list, file_key.tcp_proxy_server_client) ?? [];
}

function getSyncTaskList(): tcp_proxy_sync_task_item[] {
    return DataUtil.get(data_common_key.tcp_proxy_sync_task_list, file_key.tcp_proxy_server_client) ?? [];
}

function saveSyncTaskList(list: tcp_proxy_sync_task_item[]) {
    DataUtil.set(data_common_key.tcp_proxy_sync_task_list, list, file_key.tcp_proxy_server_client);
}

export class TcpSyncService {
    private normalizeTask(task: tcp_proxy_sync_task_item) {
        task.source_dir = (task.source_dir ?? "").trim();
        task.target_dir = (task.target_dir ?? "").trim();
        task.delete_missing = task.delete_missing !== false;
        task.open = !!task.open;
        task.ignore_list = (task.ignore_text ?? "")
            .split('\n')
            .map(line => line.trim())          // 去除首尾空白
            .filter(line =>
                line &&                          // 过滤空行
                !line.startsWith('#')            // 过滤 # 开头
            );
        return task;
    }

    private syncNames(task: tcp_proxy_sync_task_item) {
        const clients = getClientList();
        const source = clients.find((item) => item.client_num_id === task.source_client_num_id);
        const target = clients.find((item) => item.client_num_id === task.target_client_num_id);
        task.source_client_name = source?.client_name ?? '';
        task.target_client_name = target?.client_name ?? '';
        return task;
    }

    private isRelated(task: tcp_proxy_sync_task_item, client_num_id: number) {
        return task.source_client_num_id === client_num_id || task.target_client_num_id === client_num_id;
    }

    private sendTaskToClient(task: tcp_proxy_sync_task_item, client_num_id: number) {
        // if(!tcpForwardService.client_num_map[task.source_client_num_id] || !tcpForwardService.client_num_map[task.target_client_num_id]) {
        //     // 两个客户端有一个不在线就不开始了
        //     return
        // }
        if(task.source_client_num_id === task.target_client_num_id) {
            return ;
        }
        const client = tcpForwardService.client_num_map[client_num_id];
        client?.client_util?.send_data(NetMsgType.tcp_sync_task_config, Buffer.from(JSON.stringify(task)));
    }

    private sendDelTaskToClient(task: tcp_proxy_sync_task_item) {
        // if(!tcpForwardService.client_num_map[task.source_client_num_id] || !tcpForwardService.client_num_map[task.target_client_num_id]) {
        //     // 两个客户端有一个不在线就不开始了
        //     return
        // }
        const source_client = tcpForwardService.client_num_map[task.source_client_num_id];
        source_client?.client_util?.send_data(NetMsgType.tcp_sync_task_config_delete, Buffer.from(JSON.stringify({
            task_id:task.id
        })));

        const target_client = tcpForwardService.client_num_map[task.target_client_num_id];
        target_client?.client_util?.send_data(NetMsgType.tcp_sync_task_config_delete, Buffer.from(JSON.stringify({
            task_id:task.id
        })));
    }

    private clearTaskOnClient(task: tcp_proxy_sync_task_item, client_num_id: number) {
        const client = tcpForwardService.client_num_map[client_num_id];
        client?.client_util?.send_data(NetMsgType.tcp_sync_task_clear, Buffer.from(JSON.stringify({
            task_id: task.id,
        })));
    }

    public get_all_sync_task_list() {
        const list = getSyncTaskList()
        for (const task of list) {
            this.syncNames(task)
        }
        return list;
    }

    public get_sync_task_list_by_client(client_num_id: number) {
        return this.get_all_sync_task_list().filter((task) => this.isRelated(task, client_num_id));
    }

    public push_sync_task_to_client(client_num_id: number) {
        for (const task of this.get_sync_task_list_by_client(client_num_id)) {
            this.sendTaskToClient(task, client_num_id);
        }
    }

    // public push_sync_task_to_all() {
    //     for (const key of Object.keys(tcpForwardService.client_num_map)) {
    //         this.push_sync_task_to_client(Number(key));
    //     }
    // }

    // 两个目录有没有包含关系
    isAbsoluteRelated(absA, absB) {
        // 只要其中一个方向的相对路径不以 '..' 开头，就说明存在包含或相等关系
        return !path.relative(absA, absB).startsWith('..') ||
            !path.relative(absB, absA).startsWith('..');
    }

    public save_sync_task(task: tcp_proxy_sync_task_item) {
        const list = getSyncTaskList();
        const current = this.normalizeTask(task);

        if (!current.source_client_num_id || !current.target_client_num_id) {
            throw new Error("Sync task needs two client ids");
        }
        if (!current.source_dir || !current.target_dir) {
            throw new Error("Source and target directory are required");
        }

        if (current.source_client_num_id === current.target_client_num_id) {
            // if(this.isAbsoluteRelated(current.source_dir,current.target_dir)) {
            //     throw new Error("Source and target dir must be different when same client");
            // }
            throw new Error("Source and target id must be different ");
        }

        const existingIndex = current.id ? list.findIndex((item) => item.id === current.id) : -1;
        if (existingIndex >= 0) {
            list[existingIndex] = this.syncNames({
                ...list[existingIndex],
                ...current,
            });
        } else {
            current.id = current.id ?? generateSaltyUUID();
            list.push(this.syncNames(current));
        }

        saveSyncTaskList(list);
        const saved = list.find((item) => item.id === current.id);
        if (saved?.open) {
            this.push_sync_task_to_client(saved.source_client_num_id);
            this.push_sync_task_to_client(saved.target_client_num_id);
        } else if (saved) {
            this.clearTaskOnClient(saved, saved.source_client_num_id);
            this.clearTaskOnClient(saved, saved.target_client_num_id);
        }
        return saved;
    }

    public delete_sync_task(id: string) {
        const list = getSyncTaskList();
        const next_list: tcp_proxy_sync_task_item[] = [];
        let removed: tcp_proxy_sync_task_item | undefined;
        for (const item of list) {
            if (item.id === id) {
                removed = item;
                continue;
            }
            next_list.push(item);
        }
        if (removed) {
            saveSyncTaskList(next_list);
            // this.clearTaskOnClient(removed, removed.source_client_num_id);
            // this.clearTaskOnClient(removed, removed.target_client_num_id);
            this.sendDelTaskToClient(removed)
        }
        return removed;
    }

    public get_sync_task_by_id(id: string) {
        return this.get_all_sync_task_list().find((item) => item.id === id);
    }

    public async route_sync_event(buffer: Buffer) {
        const envelope = parseSyncEnvelope(buffer);
        const task = this.get_sync_task_by_id(envelope.header.task_id);
        if (!task || !task.open) {
            return;
        }
        // if (task.source_client_num_id !== envelope.header.source_client_num_id || task.target_client_num_id !== envelope.header.target_client_num_id) {
        //     return;
        // }
        const target = tcpForwardService.client_num_map[envelope.header.target_client_num_id];
        await target?.client_util?.send_data_async(NetMsgType.tcp_sync_task_event, buffer);
    }

    public send_sync_event_to_server(task_id: string, source_client_num_id: number, target_client_num_id: number, payload: Buffer) {
        const source = tcpForwardService.client_num_map[source_client_num_id];
        if (!source) {
            return false;
        }
        return source.client_util.send_data(
            NetMsgType.tcp_sync_task_event,
            buildSyncEnvelope({
                task_id,
                event: "change",
                relative_path: "",
                source_client_num_id,
                target_client_num_id,
            }, payload)
        );
    }
}

export const tcpSyncService = new TcpSyncService();
