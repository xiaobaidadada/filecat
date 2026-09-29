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
        task.delete_missing = task.delete_missing !== false;
        task.open = !!task.open;
        task.ignore_list = (task.ignore_text ?? "")
            .split('\n')
            .map(line => line.trim())          // 去除首尾空白
            .filter(line =>
                line &&                          // 过滤空行
                !line.startsWith('#')            // 过滤 # 开头
            );
        task.targets = (task.targets ?? []).map((item) => ({
            ...item,
            dir: (item.dir ?? "").trim(),
            full_sync: !!item.full_sync,
        }));
        return task;
    }

    private syncNames(task: tcp_proxy_sync_task_item) {
        const clients = getClientList();
        const source = clients.find((item) => item.client_num_id === task.source_client_num_id);
        task.source_client_name = source?.client_name ?? '';
        for (const target of task.targets ?? []) {
            target.client_name = clients.find((item) => item.client_num_id === target.client_num_id)?.client_name ?? '';
        }
        return task;
    }

    /** 任务是否与某个客户端有关（源端，或者任意一个目标端） */
    private isRelated(task: tcp_proxy_sync_task_item, client_num_id: number) {
        if (task.source_client_num_id === client_num_id) {
            return true;
        }
        return (task.targets ?? []).some((item) => item.client_num_id === client_num_id);
    }

    /**
     * 把「一条多目标任务」展开成若干「单目标子任务」。
     * worker 侧只认识单目标的 task（一个 local_dir + 一个 remote_client_id），
     * 通过 id 加后缀区分，避免动 worker 的 runtime/cache 结构。
     */
    private expandTask(task: tcp_proxy_sync_task_item): tcp_proxy_sync_task_item[] {
        if (task.source_client_num_id === undefined || task.source_client_num_id === null) {
            return [];
        }
        return (task.targets ?? [])
            .filter((target) => !!target.client_num_id)
            .filter((target) => target.client_num_id !== task.source_client_num_id)
            .map((target) => ({
                ...task,
                id: `${task.id}__${target.client_num_id}`,
                target_client_num_id: target.client_num_id,
                target_client_name: target.client_name,
                target_dir: target.dir,
                full_sync: !!target.full_sync,
                two_way_sync: false,
            }));
    }

    /** 该子任务是否属于某个客户端（源端或目标端） */
    private isSubTaskRelated(task: tcp_proxy_sync_task_item, client_num_id: number) {
        return task.source_client_num_id === client_num_id || task.target_client_num_id === client_num_id;
    }

    private sendTaskToClient(task: tcp_proxy_sync_task_item, client_num_id: number) {
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
            for (const sub of this.expandTask(task)) {
                if (this.isSubTaskRelated(sub, client_num_id)) {
                    this.sendTaskToClient(sub, client_num_id);
                }
            }
        }
    }

    // 两个目录有没有包含关系
    isAbsoluteRelated(absA, absB) {
        // 只要其中一个方向的相对路径不以 '..' 开头，就说明存在包含或相等关系
        return !path.relative(absA, absB).startsWith('..') ||
            !path.relative(absB, absA).startsWith('..');
    }

    public save_sync_task(task: tcp_proxy_sync_task_item) {
        const list = getSyncTaskList();
        const current = this.normalizeTask(task);

        if (!current.source_client_num_id) {
            throw new Error("source client is required");
        }
        if (!current.source_dir) {
            throw new Error("source directory is required");
        }

        const targets = current.targets ?? [];
        if (!targets.length) {
            throw new Error("at least one target is required");
        }
        const dup = new Set<number>();
        for (const target of targets) {
            if (!target.client_num_id) {
                throw new Error("target client is required");
            }
            if (!target.dir) {
                throw new Error("target directory is required");
            }
            if (target.client_num_id === current.source_client_num_id) {
                throw new Error("target client must differ from source client");
            }
            if (dup.has(target.client_num_id)) {
                throw new Error("duplicate target client");
            }
            dup.add(target.client_num_id);
        }

        const existingIndex = current.id ? list.findIndex((item) => item.id === current.id) : -1;
        let previous: tcp_proxy_sync_task_item | undefined;
        if (existingIndex >= 0) {
            previous = list[existingIndex];
            list[existingIndex] = this.syncNames({
                ...previous,
                ...current,
            });
        } else {
            current.id = current.id ?? generateSaltyUUID();
            list.push(this.syncNames(current));
        }

        saveSyncTaskList(list);
        const saved = list.find((item) => item.id === current.id);

        // 先按旧配置清理，再按新配置下发，覆盖「目标被移除 / 目录被改」的情况
        if (previous) {
            this.clearTaskEverywhere(previous);
        }

        if (saved?.open) {
            for (const sub of this.expandTask(saved)) {
                this.sendTaskToClient(sub, sub.source_client_num_id);
                this.sendTaskToClient(sub, sub.target_client_num_id);
            }
        } else if (saved) {
            this.clearTaskEverywhere(saved);
        }
        return saved;
    }

    /** 把任务展开后的所有子任务在涉及到的客户端上清掉（worker 的 runtime 以子任务 id 为 key） */
    private clearTaskEverywhere(task: tcp_proxy_sync_task_item) {
        for (const sub of this.expandTask(task)) {
            this.sendClearToClient(sub, sub.source_client_num_id);
            this.sendClearToClient(sub, sub.target_client_num_id);
        }
    }

    private sendClearToClient(task: tcp_proxy_sync_task_item, client_num_id: number) {
        const client = tcpForwardService.client_num_map[client_num_id];
        client?.client_util?.send_data(NetMsgType.tcp_sync_task_clear, Buffer.from(JSON.stringify({
            task_id: task.id,
        })));
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
            for (const sub of this.expandTask(removed)) {
                this.sendDelTaskToClient(sub);
            }
        }
        return removed;
    }

    public get_sync_task_by_id(id: string) {
        return this.get_all_sync_task_list().find((item) => item.id === id);
    }

    /**
     * 按 id 找任务，兼容「子任务 id」。
     * 客户端 worker 建信封时用的是自己的 runtime task.id，即 `父id__目标客户端id` 形态，
     * 直接按父 id 查会查不到，导致同步事件被丢弃。
     */
    private get_sync_task_by_any_id(id: string) {
        const list = this.get_all_sync_task_list();
        const direct = list.find((item) => item.id === id);
        if (direct) {
            return direct;
        }
        const parent_id = id?.split('__')[0];
        return list.find((item) => item.id === parent_id);
    }

    public async route_sync_event(buffer: Buffer) {
        const envelope = parseSyncEnvelope(buffer);
        const task = this.get_sync_task_by_any_id(envelope.header.task_id);
        if (!task || !task.open) {
            return;
        }
        // if (task.source_client_num_id !== envelope.header.source_client_num_id || task.target_client_num_id !== envelope.header.target_client_num_id) {
        //     return;
        // }
        const target = tcpForwardService.client_num_map[envelope.header.target_client_num_id];
        await target?.client_util?.send_data_async(NetMsgType.tcp_sync_task_event, buffer);
    }

    /**
     * 立即同步：把 rescan 指令发给该任务展开后涉及的所有客户端（源端和全部目标端）。
     * 只有源端会真正重扫（目标端 rescan_task 里 shouldManageTask 会挡掉接收方向）。
     */
    public rescan_sync_task(id: string) {
        const task = this.get_sync_task_by_id(id);
        if (!task) {
            throw new Error("Sync task not found");
        }
        if (!task.open) {
            throw new Error("Sync task is not open");
        }
        const subs = this.expandTask(task);
        if (!subs.length) {
            throw new Error("Sync task has no target");
        }
        for (const sub of subs) {
            const payload = Buffer.from(JSON.stringify(sub));
            const source = tcpForwardService.client_num_map[sub.source_client_num_id];
            source?.client_util?.send_data(NetMsgType.tcp_sync_task_rescan, payload);
            const target = tcpForwardService.client_num_map[sub.target_client_num_id];
            target?.client_util?.send_data(NetMsgType.tcp_sync_task_rescan, payload);
        }
        return task;
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
