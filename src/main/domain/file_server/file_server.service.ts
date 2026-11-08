import * as path from "path";
import {DataUtil} from "../data/DataUtil";
import {data_common_key} from "../data/data_type";
import {FileUtil} from "../file/FileUtil";
import {FileServerItem, FileServerState, FileServerType, validate_file_server} from "./file_server.pojo";
import {SftpServer} from "./sftp_server";
import {WebdavServer} from "./webdav_server";
import {SmbServer} from "./smb_server";
import {ServerEvent} from "../../other/config";
import {get_bin_dependency} from "../bin/get_bin_dependency";

/**
 * 文件服务管理。
 *
 * 负责文件服务配置的增删改查，以及各协议服务实例的启动/停止。
 * 配置持久化在 data_common_key.file_server_list 里。
 */
export class FileServerService {

    /** 正在运行的服务实例，key 是配置 id */
    private running = new Map<string, SftpServer | WebdavServer | SmbServer>();

    /** SFTP 主机密钥，全进程共用一份，避免每个服务单独生成导致指纹不同 */
    private host_key: string | undefined;

    // ==================== 配置管理 ====================

    list(): FileServerItem[] {
        return DataUtil.get<FileServerItem[]>(data_common_key.file_server_list) ?? [];
    }

    private save(list: FileServerItem[]): void {
        DataUtil.set(data_common_key.file_server_list, list);
    }

    get(id: string): FileServerItem | undefined {
        return this.list().find(v => v.id === id);
    }

    /** 端口是否已被其它服务占用 */
    private port_conflict(port: number, exclude_id?: string): boolean {
        return this.list().some(v => v.port === port && v.id !== exclude_id);
    }

    /** 新增配置，不自动启动 */
    add(item: Omit<FileServerItem, "id" | "created_at">): FileServerItem {
        const err = validate_file_server(item);
        if (err) {
            throw new Error(err);
        }
        if (this.port_conflict(item.port)) {
            throw new Error(`port ${item.port} is already used by another service`);
        }
        const full: FileServerItem = {
            ...item,
            id: `fsv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            created_at: Date.now(),
        };
        const list = this.list();
        list.push(full);
        this.save(list);
        return full;
    }

    /** 修改配置；正在运行的会在改完后重启 */
    async update(id: string, patch: Partial<FileServerItem>): Promise<FileServerItem> {
        const list = this.list();
        const idx = list.findIndex(v => v.id === id);
        if (idx < 0) {
            throw new Error("file server not found");
        }
        const merged = {...list[idx], ...patch, id};
        const err = validate_file_server(merged);
        if (err) {
            throw new Error(err);
        }
        if (this.port_conflict(merged.port, id)) {
            throw new Error(`port ${merged.port} is already used by another service`);
        }

        const was_running = this.running.has(id);
        if (was_running) {
            await this.stop(id);
        }

        list[idx] = merged;
        this.save(list);

        if (was_running && merged.enabled) {
            await this.start(id);
        }
        return merged;
    }

    /** 删除配置；运行中的先停止 */
    async remove(id: string): Promise<void> {
        if (this.running.has(id)) {
            await this.stop(id);
        }
        const list = this.list().filter(v => v.id !== id);
        this.save(list);
    }

    // ==================== 运行控制 ====================

    /** 启动一个服务 */
    async start(id: string): Promise<void> {
        const item = this.get(id);
        if (!item) {
            throw new Error("file server not found");
        }
        // 开启即视为启用，重启后自动拉起
        if (item.enabled === false) {
            this.set_enabled(id, true);
            item.enabled = true;
        }
        if (this.running.has(id)) {
            return;
        }

        // 根目录必须存在，否则各协议行为不一致
        const st = await FileUtil.statSync(item.root_path).catch(() => null);
        if (!st || !st.isDirectory()) {
            throw new Error("root_path does not exist or is not a directory");
        }

        if (item.type === FileServerType.sftp) {
            const srv = new SftpServer(item);
            srv.set_host_key(this.get_host_key());
            await srv.start();
            this.running.set(id, srv);
            return;
        }

        if (item.type === FileServerType.webdav) {
            const srv = new WebdavServer(item);
            await srv.start();
            this.running.set(id, srv);
            return;
        }

        if (item.type === FileServerType.smb) {
            const srv = new SmbServer(item);
            await srv.start();
            this.running.set(id, srv);
            return;
        }

        throw new Error(`unsupported protocol: ${item.type}`);
    }

    /** 停止一个服务 */
    async stop(id: string): Promise<void> {
        // 关闭即视为禁用，重启后不再自动拉起
        this.set_enabled(id, false);
        const srv = this.running.get(id);
        if (!srv) {
            return;
        }
        await srv.stop();
        this.running.delete(id);
    }

    /** 只更新 enabled 字段，不启动/停止服务 */
    private set_enabled(id: string, enabled: boolean) {
        const list = this.list();
        const item = list.find(v => v.id === id);
        if (!item) return;
        item.enabled = enabled;
        this.save(list);
    }

    /** 取运行状态 */
    state(id: string): FileServerState {
        const srv = this.running.get(id);
        const item = this.get(id);
        return {
            running: Boolean(srv?.is_running()),
            port: item?.port ?? 0,
        };
    }

    /** 启动所有已启用的服务（进程启动时调用） */
    async start_all_enabled(): Promise<void> {
        for (const item of this.list()) {
            if (item.enabled === false) {
                continue;
            }
            try {
                await this.start(item.id);
            } catch (e) {
                // 单个服务启动失败不影响其它服务
                console.error(`文件服务 ${item.note || item.id} 启动失败`, e);
            }
        }
    }

    /** 停止所有服务（进程退出时调用） */
    async stop_all(): Promise<void> {
        for (const id of Array.from(this.running.keys())) {
            try {
                await this.stop(id);
            } catch (e) {
                // 忽略
            }
        }
    }

    /**
     * 生成（并缓存）SFTP 主机密钥。
     * ssh2 只认 OpenSSH 格式的私钥，所以用它的 utils 生成而不是 Node 原生 crypto。
     */
    private get_host_key(): string {
        if (this.host_key) {
            return this.host_key;
        }
        const {utils} = get_bin_dependency("@xiaobaidadada/ssh2-prebuilt", false);
        const pair = utils.generateKeyPairSync("ed25519");
        this.host_key = pair.private;
        return this.host_key;
    }
}

export const fileServerService = new FileServerService();

// 进程启动后拉起所有已启用的文件服务
ServerEvent.on("start", async () => {
    await fileServerService.start_all_enabled();
});
