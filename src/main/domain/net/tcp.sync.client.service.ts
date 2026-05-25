import path from "path";
import fs from "fs";
import fse from "fs-extra";
import {tcp_proxy_client_fig, tcp_proxy_sync_task_item} from "../../../common/req/common.pojo";
import {NetClientUtil} from "./util/NetClientUtil";
import {NetMsgType} from "./util/NetUtil";
import {
    buildSyncEnvelope,
    createSyncIgnoreMatcher,
    normalizeSyncRelativePath,
    parseSyncEnvelope,
    safeResolveSyncPath
} from "./tcp.sync.util";
import {tcp_forward_client_service} from "./tcp.forward.client.service";

const chokidar = require("chokidar");

type ChokidarWatcher = ReturnType<typeof chokidar.watch>;

interface SyncRuntimeState {
    task: tcp_proxy_sync_task_item;
    watcher?: ChokidarWatcher;
    ignore: (relative_path: string, is_directory?: boolean) => boolean;
    suppress_set: Set<string>;
}

function readFileBuffer(file_path: string) {
    return fs.promises.readFile(file_path);
}

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
    private runtime_map = new Map<string, SyncRuntimeState>();

    private getClientRole(task: tcp_proxy_sync_task_item, client_num_id: number) {
        if (task.source_client_num_id === client_num_id) {
            return "source";
        }
        if (task.target_client_num_id === client_num_id) {
            return "target";
        }
        return "";
    }

    private shouldManageTask(task: tcp_proxy_sync_task_item, client_num_id: number) {
        return this.getClientRole(task, client_num_id) !== "";
    }

    private stopRuntime(task_id: string) {
        const runtime = this.runtime_map.get(task_id);
        if (runtime?.watcher) {
            runtime.watcher.close();
        }
        this.runtime_map.delete(task_id);
    }

    public clearAll() {
        for (const task_id of this.runtime_map.keys()) {
            this.stopRuntime(task_id);
        }
    }

    private scheduleSuppress(runtime: SyncRuntimeState, relative_path: string) {
        const key = normalizeSyncRelativePath(relative_path);
        if (!key) return;
        runtime.suppress_set.add(key);
        setTimeout(() => {
            runtime.suppress_set.delete(key);
        }, 5000);
    }

    private isSuppressed(runtime: SyncRuntimeState, relative_path: string) {
        const key = normalizeSyncRelativePath(relative_path);
        return !!key && runtime.suppress_set.has(key);
    }

    private async applySourceEvent(task: tcp_proxy_sync_task_item, header: ReturnType<typeof parseSyncEnvelope>["header"], payload: Buffer) {
        const targetRoot = task.target_dir;
        const relative = normalizeSyncRelativePath(header.relative_path);
        if (!relative) return;

        const runtime = this.runtime_map.get(task.id);
        if (!runtime) return;
        if (runtime.ignore(relative, header.is_directory)) {
            return;
        }
        if (this.isSuppressed(runtime, relative)) {
            return;
        }

        const targetPath = safeResolveSyncPath(targetRoot, relative);
        this.scheduleSuppress(runtime, relative);

        switch (header.event) {
            case "addDir":
                await fse.ensureDir(targetPath);
                break;
            case "unlinkDir":
                if (task.delete_missing !== false) {
                    await fse.remove(targetPath);
                }
                break;
            case "unlink":
                if (task.delete_missing !== false) {
                    await fse.remove(targetPath);
                }
                break;
            case "add":
            case "change":
                await fse.ensureDir(path.dirname(targetPath));
                await fs.promises.writeFile(targetPath, payload);
                break;
            default:
                break;
        }
    }

    private async watchSource(task: tcp_proxy_sync_task_item) {
        const runtime = this.runtime_map.get(task.id);
        if (!runtime || runtime.watcher) {
            return;
        }

        await fse.ensureDir(task.source_dir);
        await fse.ensureDir(task.target_dir);

        const watcher = chokidar.watch(task.source_dir, {
            persistent: true,
            ignoreInitial: false,
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100,
            },
            ignored: (filePath: string) => {
                const relative = normalizeSyncRelativePath(path.relative(task.source_dir, filePath));
                if (!relative) return false;
                const isDir = false;
                return runtime.ignore(relative, isDir);
            },
        });

        runtime.watcher = watcher;

        const sendEvent = async (event: "add" | "change" | "unlink" | "addDir" | "unlinkDir", fullPath: string, stats?: any) => {
            const relative = normalizeSyncRelativePath(path.relative(task.source_dir, fullPath));
            if (!relative) {
                return;
            }
            const isDir = event === "addDir" || event === "unlinkDir";
            if (runtime.ignore(relative, isDir)) {
                return;
            }

            const payload = (event === "add" || event === "change") ? await readFileBuffer(fullPath) : Buffer.alloc(0);
            const buffer = buildSyncEnvelope({
                task_id: task.id,
                event,
                relative_path: relative,
                is_directory: isDir,
                mtime: stats?.mtimeMs ?? Date.now(),
                size: stats?.size,
                source_client_num_id: task.source_client_num_id,
                target_client_num_id: task.target_client_num_id,
            }, payload);

            const serverSocket = getServerConnectionForClient(task.source_client_num_id);
            const rawClient = serverSocket?.get_raw_client?.();
            if (!rawClient?.connected) {
                return;
            }
            serverSocket.send_data(NetMsgType.tcp_sync_task_event, buffer);
        };

        watcher.on("add", (fullPath, stats) => {
            sendEvent("add", fullPath, stats).catch(console.error);
        });
        watcher.on("change", (fullPath, stats) => {
            sendEvent("change", fullPath, stats).catch(console.error);
        });
        watcher.on("unlink", (fullPath) => {
            sendEvent("unlink", fullPath).catch(console.error);
        });
        watcher.on("addDir", (fullPath, stats) => {
            sendEvent("addDir", fullPath, stats).catch(console.error);
        });
        watcher.on("unlinkDir", (fullPath) => {
            sendEvent("unlinkDir", fullPath).catch(console.error);
        });
        watcher.on("error", (error) => {
            console.error("sync watcher error", error);
        });
    }

    public async open_task(task: tcp_proxy_sync_task_item, client_num_id: number) {
        if (!this.shouldManageTask(task, client_num_id) || !task.open) {
            return;
        }

        const role = this.getClientRole(task, client_num_id);
        this.stopRuntime(task.id);
        const runtime: SyncRuntimeState = {
            task,
            ignore: createSyncIgnoreMatcher(task.ignore_list),
            suppress_set: new Set<string>(),
        };
        this.runtime_map.set(task.id, runtime);

        if (role === "source") {
            await this.watchSource(task);
        } else {
            await fse.ensureDir(task.target_dir);
        }
    }

    public close_task(task_id: string) {
        this.stopRuntime(task_id);
    }

    public async apply_remote_event(buffer: Buffer) {
        const envelope = parseSyncEnvelope(buffer);
        const runtime = this.runtime_map.get(envelope.header.task_id);
        if (!runtime || !runtime.task.open) {
            return;
        }
        const task = runtime.task;
        const currentClient = tcp_forward_client_service.client_fig_get().list.find((item) => item.client_num_id === envelope.header.target_client_num_id);
        if (!currentClient) {
            return;
        }
        if (task.target_client_num_id !== currentClient.client_num_id) {
            return;
        }

        await this.applySourceEvent(task, envelope.header, envelope.payload);
    }

    public reset_tasks(tasks: tcp_proxy_sync_task_item[]) {
        this.clearAll();
        for (const task of tasks ?? []) {
            if (task.open) {
                this.runtime_map.set(task.id, {
                    task,
                    ignore: createSyncIgnoreMatcher(task.ignore_list),
                    suppress_set: new Set<string>(),
                });
            }
        }
    }

    public async sync_task_config(task: tcp_proxy_sync_task_item, client_num_id: number) {
        await this.open_task(task, client_num_id);
    }

    public sync_task_clear(task_id: string) {
        this.close_task(task_id);
    }
}

export const tcpSyncClientService = new TcpSyncClientService();
