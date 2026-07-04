import path from "path";
import fs from "fs";
import fse from "fs-extra";
import { tcp_proxy_client_fig, tcp_proxy_sync_task_item } from "../../../../common/req/common.pojo";
import {
    AsyncQueue,
    buildSyncEnvelope, cache_file_type,
    createSyncIgnoreMatcher,
    normalizeSyncRelativePath,
    parseSyncEnvelope, QueueTaskItem,
    safeResolveSyncPath, SyncRuntimeState,
    getFilePathHash // 👈 引入刚刚定义的哈希工具函数
} from "./tcp.sync.util";
import { FileUtil } from "../../file/FileUtil";
import {register_threads_worker_handler, threads_send, threads_send_async} from "../../../threads/threads.work";
import {threads_msg_type} from "../../../threads/threads.type";

const chokidar = require("chokidar");

function readFileBuffer(file_path: string) {
    return fs.promises.readFile(file_path);
}

export class TcpSyncWorkerService {
    private runtime_map = new Map<string, SyncRuntimeState>();
    private cache_timers = new Map<string, NodeJS.Timeout>();

    client_sync_task_get() {
        const list: tcp_proxy_sync_task_item[] = []
        for (const key of this.runtime_map.keys()) {
            const v = this.runtime_map.get(key);
            v.task.running_num = v.queue.size;
            list.push(v.task);
        }
        return list;
    }


    public stopRuntime(task_id: string) {
        const runtime = this.runtime_map.get(task_id);
        if (runtime?.watcher) {
            runtime.watcher.close();
        }
        if (runtime?.queue) {
            runtime.queue.clear();
        }
        this.runtime_map.delete(task_id);

        if (this.cache_timers.has(task_id)) {
            clearTimeout(this.cache_timers.get(task_id)!);
            this.cache_timers.delete(task_id);
        }
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

    private saveCache(task_id: string, cache_path: string, cache_data: cache_file_type) {
        if (this.cache_timers.has(task_id)) {
            clearTimeout(this.cache_timers.get(task_id)!);
        }
        const timer = setTimeout(async () => {
            try {
                await FileUtil.writeFileSync(cache_path, JSON.stringify(cache_data, null, 2));
            } catch (err) {
                console.error(`[Sync Cache] 保存同步缓存失败 -> 任务 ID: ${task_id}`, err);
            }
            this.cache_timers.delete(task_id);
        }, 1000);
        this.cache_timers.set(task_id, timer);
    }

    private async applySourceEvent(task: tcp_proxy_sync_task_item, header: ReturnType<typeof parseSyncEnvelope>["header"], payload: Buffer) {
        const runtime = this.runtime_map.get(task.id);
        if (!runtime) return;

        const relative = normalizeSyncRelativePath(header.relative_path);
        if (!relative) return;

        if (runtime.ignore(relative, header.is_directory)) {
            return;
        }
        if (this.isSuppressed(runtime, relative)) {
            return;
        }

        const localPath = safeResolveSyncPath(runtime.local_dir, relative);
        this.scheduleSuppress(runtime, relative);

        switch (header.event) {
            case "addDir":
                await fse.ensureDir(localPath);
                break;
            case "unlinkDir":
                if (task.delete_missing !== false) {
                    await fse.remove(localPath);
                }
                break;
            case "unlink":
                if (task.delete_missing !== false) {
                    await fse.remove(localPath);
                }
                break;
            case "add":
            case "change":
                await fse.ensureDir(path.dirname(localPath));
                await fs.promises.writeFile(localPath, payload);
                break;
            default:
                break;
        }
    }

    private async processSyncTaskItem(runtime: SyncRuntimeState, taskItem: QueueTaskItem, current_client_id: number) {
        const { event, fullPath } = taskItem;
        const relative = normalizeSyncRelativePath(path.relative(runtime.local_dir, fullPath));
        if (!relative) return;

        if (this.isSuppressed(runtime, relative)) return;

        try {
            const isDir = event === "addDir" || event === "unlinkDir";
            let mtime = Date.now();
            let size: number | undefined = undefined;
            let payload = Buffer.alloc(0);
            let transferList: ArrayBuffer[] = []; // 👈 新增：转移列表

            if (event === "add" || event === "change") {
                try {
                    const stats = await fs.promises.stat(fullPath);
                    mtime = stats.mtimeMs;
                    size = stats.size;

                    // 全量同步模式下不依赖缓存，强制同步所有文件
                    if (!runtime.task.full_sync) {
                        const pathHash = getFilePathHash(runtime.local_dir, fullPath);
                        if (runtime.cache_file_map[pathHash]) {
                            if (runtime.cache_file_map[pathHash].mtime === mtime) {
                                return;
                            }
                        }
                    }

                    // 读取文件为 Node Buffer
                    const fileBuffer = await readFileBuffer(fullPath);

                    // 核心：提取底层的 ArrayBuffer 用于零拷贝转移
                    // 注意：如果是从小文件或 Buffer 池分配的，byteLength 可能不等于 buffer.byteLength，
                    // 但对于大文件，fs.readFile 返回的是独立、干净的 ArrayBuffer
                    payload = fileBuffer;
                    if (fileBuffer.buffer instanceof ArrayBuffer) {
                        transferList.push(fileBuffer.buffer);
                    }

                } catch (statErr) {
                    return;
                }
            }

            const buffer = buildSyncEnvelope({
                task_id: runtime.task.id,
                event,
                relative_path: relative,
                is_directory: isDir,
                mtime,
                size,
                source_client_num_id: current_client_id,
                target_client_num_id: runtime.remote_client_id,
            }, payload);

            // ⭐ 如果包装后的信封 buffer 也是独立的 ArrayBuffer，也可以选择转移它
            // 这里我们直接将大 buffer 传入发送，并携带底层的 ArrayBuffer 转移权
            await threads_send_async(
               threads_msg_type.file_watch_send,
                 {
                    current_client_id,
                    buffer // 此时发送到主线程的 buffer 已经是零拷贝了
                }
            , 5000,transferList); // 👈 传入转移列表

            if (event === "add" || event === "change") {
                const pathHash = getFilePathHash(runtime.local_dir, fullPath);
                runtime.cache_file_map[pathHash] = { mtime };
                this.saveCache(runtime.task.id, runtime.cache_path, runtime.cache_file_map);
            }
        } catch (err) {
            console.error(`[Sync Queue] 处理文件事件失败: ${fullPath} 继续下一个`, err);
        }
    }

    public async apply_remote_event(rawBuffer: Buffer) {
        // ⭐ 核心修复：将跨线程传输后丢失原型的普通对象/Uint8Array 重新转换为标准的 Buffer
        const buffer = Buffer.from(rawBuffer);

        const envelope = parseSyncEnvelope(buffer);
        const runtime = this.runtime_map.get(envelope.header.task_id);
        if (!runtime || !runtime.task.open) {
            return;
        }

        const task = runtime.task;

        if (task.source_client_num_id !== envelope.header.target_client_num_id &&
            task.target_client_num_id !== envelope.header.target_client_num_id) {
            return;
        }

        await this.applySourceEvent(task, envelope.header, envelope.payload);
    }

    private async watchLocalDir(task: tcp_proxy_sync_task_item, current_client_id: number) {
        const runtime = this.runtime_map.get(task.id);
        if (!runtime || runtime.watcher) {
            return;
        }

        await fse.ensureDir(runtime.local_dir);

        const watcher = chokidar.watch(runtime.local_dir, {
            persistent: true,
            ignoreInitial: !task.full_sync,
            alwaysStat: false,
            ignored: (filePath: string) => {
                const relative = normalizeSyncRelativePath(path.relative(runtime.local_dir, filePath));
                if (!relative) return false;
                return runtime.ignore(relative, false);
            },
        });

        runtime.watcher = watcher;

        const sendEvent = (event: "add" | "change" | "unlink" | "addDir" | "unlinkDir", fullPath: string) => {
            const relative = normalizeSyncRelativePath(path.relative(runtime.local_dir, fullPath));
            if (!relative) return;

            const isDir = event === "addDir" || event === "unlinkDir";
            if (runtime.ignore(relative, isDir)) return;
            if (this.isSuppressed(runtime, relative)) return;

            runtime.queue.push({ event, fullPath });
        };

        watcher.on("add", (fullPath) => { sendEvent("add", fullPath); });
        watcher.on("change", (fullPath) => { sendEvent("change", fullPath); });

        watcher.on("unlink", (fullPath) => {
            // ⭐ 重构：删除文件时，同样计算 Hash 并在缓存中抹除
            const pathHash = getFilePathHash(runtime.local_dir, fullPath);
            if (runtime.cache_file_map[pathHash]) {
                delete runtime.cache_file_map[pathHash];
                this.saveCache(task.id, runtime.cache_path, runtime.cache_file_map);
            }
            sendEvent("unlink", fullPath);
        });

        watcher.on("addDir", (fullPath) => { sendEvent("addDir", fullPath); });
        watcher.on("unlinkDir", (fullPath) => { sendEvent("unlinkDir", fullPath); });
        watcher.on("error", (error) => { console.error("sync watcher error", error); });
        watcher.on("ready", () => { console.log(`[Sync] 文件同步任务 ${task.id} 的初始化本地盘点遍历完成。`); });
    }

    public async open_task(task: tcp_proxy_sync_task_item, client_num_id: number, cache_path: string) {

        this.stopRuntime(task.id);

        let cache_file_map: cache_file_type = {};
        if (!await FileUtil.access(cache_path)) {
            await FileUtil.writeFileSync(cache_path, JSON.stringify(cache_file_map));
        } else {
            try {
                // 读取 JSON 时，由于 JSON 的 key 永远是 string，转为 Object 后 JS 会自动做兼容映射
                cache_file_map = JSON.parse((await FileUtil.readFileSync(cache_path)).toString());
            } catch (err) {
                console.error(`[Sync Cache] 解析本地增量缓存失败，重置为空缓存: ${task.id}`, err);
            }
        }

        let local_dir = "";
        let remote_client_id = 0;

        if (task.source_client_num_id === client_num_id) {
            local_dir = task.source_dir;
            remote_client_id = task.target_client_num_id;
        } else {
            local_dir = task.target_dir;
            remote_client_id = task.source_client_num_id;
        }

        const runtimeStatePlaceholder = {} as SyncRuntimeState;

        const queue = new AsyncQueue(1, async (taskItem) => {
            await this.processSyncTaskItem(runtimeStatePlaceholder, taskItem, client_num_id);
        });

        const runtime: SyncRuntimeState = {
            task,
            ignore: createSyncIgnoreMatcher(task.ignore_list),
            suppress_set: new Set<string>(),
            local_dir,
            remote_client_id,
            cache_file_map,
            cache_path,
            client_num_id,
            queue
        };

        Object.assign(runtimeStatePlaceholder, runtime);
        this.runtime_map.set(task.id, runtime);

        if (task.target_client_num_id === client_num_id && !task.two_way_sync) {
            await fse.ensureDir(task.target_dir);
            return;
        }

        await this.watchLocalDir(task, client_num_id);
    }

    public reset_tasks(tasks: tcp_proxy_sync_task_item[]) {
        this.clearAll();
    }
}

export const workerService = new TcpSyncWorkerService();

export function tcp_file_sync_work_start() {
    register_threads_worker_handler(threads_msg_type.file_watch_init, async (data) => {
        const {task, client_num_id, cache_path} = data.data;
        workerService.open_task(task, client_num_id, cache_path).catch(console.error);
    });
    register_threads_worker_handler(threads_msg_type.file_watch_close, async (data) => {
        const {task_id} = data.data;
        workerService.stopRuntime(task_id);
    });
    register_threads_worker_handler(threads_msg_type.file_watch_apply, async (data) => {
        const {buffer} = data.data;
        workerService.apply_remote_event(buffer).catch(console.error);
    });
    register_threads_worker_handler(threads_msg_type.file_watch_sync_task_get, async (data) => {
        return workerService.client_sync_task_get();
    });
}