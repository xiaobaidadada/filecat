import path from "path";
import fs from "fs";
import fse from "fs-extra";
import { tcp_proxy_client_fig, tcp_proxy_sync_task_item } from "../../../common/req/common.pojo";
import { NetClientUtil } from "./util/NetClientUtil";
import { NetMsgType } from "./util/NetUtil";
import {
    buildSyncEnvelope,
    createSyncIgnoreMatcher,
    normalizeSyncRelativePath,
    parseSyncEnvelope,
    safeResolveSyncPath
} from "./tcp.sync.util";
import { tcp_forward_client_service } from "./tcp.forward.client.service";
import { DataUtil } from "../data/DataUtil";
import { data_dir_tem_name } from "../data/data_type";
import { FileUtil } from "../file/FileUtil";

const chokidar = require("chokidar");

type ChokidarWatcher = ReturnType<typeof chokidar.watch>;
type cache_file_type = { [key: string]: { mtime: number } }

// 简单的异步排队执行器
class AsyncQueue {
    private queue: (() => Promise<void>)[] = [];
    private activeCount = 0; // 记录当前正在执行的任务数

    // concurrency = 1 代表严格串行（等前一个 await 完再执行下一个）
    constructor(private concurrency: number = 1) {}

    public push(task: () => Promise<void>) {
        this.queue.push(task);
        this.next();
    }

    public get size(): number {
        return this.queue.length;
    }

    private next() {
        // 如果当前执行中的任务数达到了最大并发限制，或者队列空了，就直接返回
        if (this.activeCount >= this.concurrency || this.queue.length === 0) {
            return;
        }

        const task = this.queue.shift();
        if (task) {
            this.activeCount++; // 占用一个并发名额

            // 核心：不需要用 running 锁，直接同步调用异步函数
            task().finally(() => {
                this.activeCount--; // 任务彻底完成后（await 结束），释放名额
                this.next();        // 递归调用，继续消耗队列
            }).catch(e=>{
                console.log(e)
            });

            // ⭐ 关键点：如果是多并发(concurrency > 1)，
            // 允许在当前任务挂起(await)时，继续贪婪地拉取下一个任务
            this.next();
        }
    }

    public clear() {
        this.queue = [];
        this.activeCount = 0;
    }
}

interface SyncRuntimeState {
    task: tcp_proxy_sync_task_item;
    watcher?: ChokidarWatcher;
    ignore: (relative_path: string, is_directory?: boolean) => boolean;
    suppress_set: Set<string>;
    local_dir: string;
    remote_client_id: number;
    cache_file_map: cache_file_type;
    cache_path: string;
    client_num_id: number;
    queue: AsyncQueue; // ⭐ 为每个任务运行时新增一个独立的队列
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
    private cache_timers = new Map<string, NodeJS.Timeout>();

    client_sync_task_get() {
        const list:tcp_proxy_sync_task_item[] = []
        for (const key of this.runtime_map.keys()) {
            const v = this.runtime_map.get(key);
            v.task.running_num = v.queue.size;
            list.push(v.task);
        }
        return list;
    }

    // 检查当前客户端是否属于该任务的一员（无论作为 Source 还是 Target）
    private shouldManageTask(task: tcp_proxy_sync_task_item, client_num_id: number) {
        return task.source_client_num_id === client_num_id || task.target_client_num_id === client_num_id;
    }

    // 判定当前节点在双向全双工同步里对应的本地角色和远程节点
    private getClientRole(task: tcp_proxy_sync_task_item, client_num_id: number) {
        if (task.source_client_num_id === client_num_id) {
            return "source";
        }
        if (task.target_client_num_id === client_num_id) {
            return "target";
        }
        return "";
    }

    public stopRuntime(task_id: string) {
        const runtime = this.runtime_map.get(task_id);
        if (runtime?.watcher) {
            runtime.watcher.close();
        }
        if (runtime?.queue) {
            runtime.queue.clear(); // ⭐ 清理未完成的队列
        }
        this.runtime_map.delete(task_id);

        // 清理防抖定时器
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

    // 关键拦截机制：给本地相对路径加“抑制锁”，防止双向数据无限循环镜像
    private scheduleSuppress(runtime: SyncRuntimeState, relative_path: string) {
        const key = normalizeSyncRelativePath(relative_path);
        if (!key) return;
        runtime.suppress_set.add(key);
        setTimeout(() => {
            runtime.suppress_set.delete(key);
        }, 5000); // 5秒后解锁，留足磁盘 I/O 写入和 chokidar 捕获的时间延迟
    }

    private isSuppressed(runtime: SyncRuntimeState, relative_path: string) {
        const key = normalizeSyncRelativePath(relative_path);
        return !!key && runtime.suppress_set.has(key);
    }

    // 高性能防抖写盘：密集同步时避免拖垮磁盘 I/O
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
        }, 1000); // 1秒防抖
        this.cache_timers.set(task_id, timer);
    }

    // 核心更新：当收到远端推送，在本地成功落盘后，必须同步校准内存与本地的缓存
    private updateMemoryCache(task_id: string, fullPath: string, mtime: number) {
        const runtime = this.runtime_map.get(task_id);
        if (!runtime) return;

        runtime.cache_file_map[fullPath] = { mtime };
        this.saveCache(task_id, runtime.cache_path, runtime.cache_file_map);
    }

    // 执行来自远程客户端传输的文件同步事件
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

        // ⭐ 核心安全设计：在修改本地磁盘前，对其加“抑制锁”，防止当前机器的 chokidar 再次捕获并二次回传给对方
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
                // 同步清理本地缓存项
                if (runtime.cache_file_map[localPath]) {
                    delete runtime.cache_file_map[localPath];
                    this.saveCache(task.id, runtime.cache_path, runtime.cache_file_map);
                }
                break;
            case "add":
            case "change":
                await fse.ensureDir(path.dirname(localPath));
                await fs.promises.writeFile(localPath, payload);

                // ⭐ 增量核心：远程落盘成功后，动态校正本地缓存，防止下次重启时作为新变动被重复发送
                try {
                    const stats = await fs.promises.stat(localPath);
                    this.updateMemoryCache(task.id, localPath, stats.mtimeMs);
                } catch (e) {
                    console.error(`[Sync] 动态刷新写入缓存失败: ${localPath}`, e);
                }
                break;
            default:
                break;
        }
    }

    // 监控本地目录变动
    private async watchLocalDir(task: tcp_proxy_sync_task_item, current_client_id: number) {
        const runtime = this.runtime_map.get(task.id);
        if (!runtime || runtime.watcher) {
            return;
        }

        // 确保要同步的本地文件夹确实存在
        await fse.ensureDir(runtime.local_dir);

        const watcher = chokidar.watch(runtime.local_dir, {
            persistent: true,
            ignoreInitial: false,
            alwaysStat: true, // 极其关键：确保 chokidar 触发初始扫描事件时自带精确的 stats 属性
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100,
            },
            ignored: (filePath: string) => {
                const relative = normalizeSyncRelativePath(path.relative(runtime.local_dir, filePath));
                if (!relative) return false;
                const isDir = false;
                return runtime.ignore(relative, isDir);
            },
        });

        runtime.watcher = watcher;

        const sendEvent = async (event: "add" | "change" | "unlink" | "addDir" | "unlinkDir", fullPath: string, stats?: any) => {
            const relative = normalizeSyncRelativePath(path.relative(runtime.local_dir, fullPath));
            if (!relative) return;

            const isDir = event === "addDir" || event === "unlinkDir";
            if (runtime.ignore(relative, isDir)) return;
            if (this.isSuppressed(runtime, relative)) return;

            // ⭐ 将高 I/O 和网络发送操作推入队列中排队
            runtime.queue.push(async () => {
                try {
                    // 再次检查防止排队期间被锁定了
                    if (this.isSuppressed(runtime, relative)) return;

                    let payload = Buffer.alloc(0);
                    if (event === "add" || event === "change") {
                        // 队列执行时才真正读取磁盘，避免海量文件瞬间把内存撑爆
                        payload = await readFileBuffer(fullPath);
                    }

                    const buffer = buildSyncEnvelope({
                        task_id: task.id,
                        event,
                        relative_path: relative,
                        is_directory: isDir,
                        mtime: stats?.mtimeMs ?? Date.now(),
                        size: stats?.size,
                        source_client_num_id: current_client_id,
                        target_client_num_id: runtime.remote_client_id,
                    }, payload);

                    const serverSocket = getServerConnectionForClient(current_client_id);
                    const rawClient = serverSocket?.get_raw_client?.();
                    if (!rawClient?.connected) return;

                    await serverSocket.send_data_async(NetMsgType.tcp_sync_task_event, buffer);

                    if ((event === "add" || event === "change") && stats?.mtimeMs) {
                        runtime.cache_file_map[fullPath] = { mtime: stats.mtimeMs };
                        this.saveCache(task.id, runtime.cache_path, runtime.cache_file_map);
                    }
                } catch (err) {
                    console.error(`[Sync Queue] 处理文件事件失败: ${fullPath} 继续下一个`, err);
                }
            });
        };

        watcher.on("add", (fullPath, stats) => {
            // 对比本地全局缓存增量
            if (runtime.cache_file_map[fullPath] && stats) {
                const cachedTime = runtime.cache_file_map[fullPath].mtime;
                if (cachedTime === stats.mtimeMs) {
                    return; // 缓存完全吻合，说明文件在离线期间没有任何改变，直接拦截不发
                }
            }
            sendEvent("add", fullPath, stats).catch(console.error);
        });

        watcher.on("change", (fullPath, stats) => {
            sendEvent("change", fullPath, stats).catch(console.error);
        });

        watcher.on("unlink", (fullPath) => {
            if (runtime.cache_file_map[fullPath]) {
                delete runtime.cache_file_map[fullPath];
                this.saveCache(task.id, runtime.cache_path, runtime.cache_file_map);
            }
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

        watcher.on("ready", () => {
            // console.log(`[Sync] 任务 ${task.id} 的初始化本地盘点遍历完成。`);
        });
    }

    public async open_task(task: tcp_proxy_sync_task_item, client_num_id: number) {
        if (!this.shouldManageTask(task, client_num_id) || !task.open) {
            return;
        }

        // 先清理并停用旧的运行实例
        this.stopRuntime(task.id);

        // 1. 初始化空缓存对象并拉取本地持久化配置
        let cache_file_map: cache_file_type = {};
        const cache_path = DataUtil.get_file_path(data_dir_tem_name.tempfile, `tcp_proxy_file_sync_${task.id}.json`);
        if (!await FileUtil.access(cache_path)) {
            await FileUtil.writeFileSync(cache_path, JSON.stringify(cache_file_map));
        } else {
            try {
                cache_file_map = JSON.parse((await FileUtil.readFileSync(cache_path)).toString());
            } catch (err) {
                console.error(`[Sync Cache] 解析本地增量缓存失败，重置为空缓存: ${task.id}`, err);
            }
        }

        // 2. 全双工反转映射：动态确认自己的本地目录以及对方的节点 ID
        let local_dir = "";
        let remote_client_id = 0;

        if (task.source_client_num_id === client_num_id) {
            local_dir = task.source_dir;
            remote_client_id = task.target_client_num_id;
        } else {
            local_dir = task.target_dir;
            remote_client_id = task.source_client_num_id;
        }

        // 3. 构建全新的双向运行时环境
        const runtime: SyncRuntimeState = {
            task,
            ignore: createSyncIgnoreMatcher(task.ignore_list),
            suppress_set: new Set<string>(),
            local_dir,
            remote_client_id,
            cache_file_map,
            cache_path,
            client_num_id,
            queue: new AsyncQueue(1) // ⭐ 初始化队列：1 表示严格先进先出排队同步
        };
        this.runtime_map.set(task.id, runtime);

        if(task.target_client_num_id === client_num_id && !task.two_way_sync) {
            // 如果自己是目标  必须开启了 双向同步才能继续
            await fse.ensureDir(task.target_dir);
            return
        }

        // 4. 双向同步：无论当前节点是 source 还是 target，所有人一律启动对本地目录的实时监控
        await this.watchLocalDir(task, client_num_id);
    }

    public close_task(task_id: string) {
        const runtime = this.runtime_map.get(task_id);
        if(runtime) {
            this.saveCache(task_id, runtime.cache_path, {});
        }
        this.stopRuntime(task_id);
    }

    // 响应和接收远端网络包的回调钩子
    public async apply_remote_event(buffer: Buffer) {
        const envelope = parseSyncEnvelope(buffer);
        const runtime = this.runtime_map.get(envelope.header.task_id);
        if (!runtime || !runtime.task.open) {
            return;
        }

        const task = runtime.task;

        // ⭐ 严格的多端多实例地址匹配校验
        // 只有当前接收端就是此同步信封明文指定的 target_client_num_id 时，才允许处理
        if (task.source_client_num_id !== envelope.header.target_client_num_id &&
            task.target_client_num_id !== envelope.header.target_client_num_id) {
            return;
        }

        await this.applySourceEvent(task, envelope.header, envelope.payload);
    }

    public reset_tasks(tasks: tcp_proxy_sync_task_item[]) {
        this.clearAll();
        // 外层服务若需批量重置，请通过循环外部重新分发 config
    }

    public async sync_task_config(task: tcp_proxy_sync_task_item, client_num_id: number) {
        await this.open_task(task, client_num_id);
    }

    public sync_task_clear(task_id: string) {
        this.close_task(task_id);
    }
}

export const tcpSyncClientService = new TcpSyncClientService();