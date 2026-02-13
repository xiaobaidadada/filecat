import { Worker as NodeWorker, parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs'
import {threads_msg_type, WorkerMessage} from "./threads.type";
const EventEmitter = require('events');

export interface on_threads_event {
    message: (msg: WorkerMessage, worker: NodeWorker) => void;
    threads_exit: (index:number) => void;
    [key: `message_${number}`]: (msg: WorkerMessage, worker: NodeWorker) => void;
    // ab/d/${a}，a 可以是 string 或 number
    // [key: `ab/d/${string | number}`]: (msg: WorkerMessage, worker: NodeWorker) => void;
}



export class ThreadsMain {
    private  worker_threads: NodeWorker[] = [];
    private  next_msg_id = 1;

    // 返回的唯一id映射用于await
    private  pending_resolves = new Map<number, (v: any) => void>();

    private event = new EventEmitter();

    private  running = false;
    private worker_path: string = "";
    private worker_num: number = 1;



    public   generate_random_id(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    /**
     * 删除指定 worker
     * @param index 可选，要删除的 worker 下标，默认删除最后一个
     */
    public async remove_worker(index?: number): Promise<boolean> {
        if (this.worker_threads.length === 0) {
            console.warn('[main] remove_worker: no workers to remove');
            return false;
        }
        // 默认删除最后一个
        if (index == null) {
            index = this.worker_threads.length - 1;
        }
        if (index < 0 || index >= this.worker_threads.length) {
            console.warn('[main] remove_worker: invalid index', index);
            return false;
        }
        const worker = this.worker_threads[index];
        try {
            // 移除事件监听，防止触发 exit/重启逻辑
            worker.removeAllListeners();
            // 安全 terminate
            await worker.terminate();
            // 从线程池中移除
            this.worker_threads.splice(index, 1);
            console.log(`[main] worker index=${index} removed`);
            return true;
        } catch (err) {
            console.error('[main] remove_worker error:', err);
            return false;
        }
    }

    public add_worker(worker_path: string = "threads.worker.js")  {
        const absPath = worker_path;
        if(!fs.existsSync(absPath)) {
            console.log('子线程路径不存在',absPath);
            throw {message:`子线程路径不存在 ${absPath}`};
        }
        let worker ;
        if (absPath.endsWith(".ts")) {
            worker = new NodeWorker(absPath,{
                execArgv: [
                    // '--inspect=52130', // 给子线程固定调试端口
                    '-r', 'ts-node/register' // 让 Node 支持直接执行 TS 文件
                ]
            });
        } else {
            worker = new NodeWorker(absPath);
        }
        this.worker_threads.push(worker);
        worker.on('message', (msg: WorkerMessage) => this.handle_message(msg, worker));
        worker.on('exit', (code) => {
            console.log(`[main] worker exited code=${code}`);
            this.pending_resolves.forEach((resolve, id) => {
                resolve(null);
                this.pending_resolves.delete(id);
            });
            this.emit_message('threads_exit',this.worker_threads.length-1)
        });
        worker.on('error', (err) => console.error('[main] worker error:', err));
    }

    /**
     * 启动 worker 线程
     */
    public  start_worker_threads(worker_path: string = "threads.worker.js", num = 1) {
        console.log('[main] 主线程启动',worker_path);
        const absPath = worker_path;
        this.worker_path = worker_path;
        this.worker_num = num;
        this.running = true;
        for (let i = 0; i < num; i++) {
            this.add_worker(absPath);
        }
        return true
    }

    public  get is_running(): boolean {
        return this.running;
    }


    /**
     * 关闭所有 worker
     */
    public  async close() {
        console.log('[main] closing all workers...');
        await this.forceTerminateAll()
        console.log('[main] all workers closed');
    }

    /**
     * fire-and-forget 广播
     */
    public  emit(msg_type: threads_msg_type, data: any,num = 1) {
        const msg: WorkerMessage = { type: msg_type, data };
        let count = 0;
        for (const w of this.worker_threads) {
            if(count >= num) break
            w.postMessage(msg);
            count++
        }
    }

    private  get_next_msg_id(): number {
        if(this.next_msg_id > 1000000000000) {
            this.next_msg_id = 0
        } else {
            this.next_msg_id++;
        }
        return this.next_msg_id;
    }

    private last_worker_index = -1; // 新增，记录上一次使用的 worker 下标
    private  get_one_worker_threads(): number {
        if (this.worker_threads.length === 0) return -1;
        // 轮询选择下一个 worker
        this.last_worker_index = (this.last_worker_index + 1) % this.worker_threads.length;
        return this.last_worker_index;
    }

    /**
     * 发送消息并 await 子线程返回结果
     */
    public  async post(msg_type: threads_msg_type, data: any, timeout_ms = 2000): Promise<any> {
        if (this.worker_threads.length === 0) throw new Error('No worker threads started');
        const msg_id = this.get_next_msg_id()
        const msg: WorkerMessage = { id: msg_id, type: msg_type, data };
        const worker = this.worker_threads[this.get_one_worker_threads()];
        if(!worker) return ;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending_resolves.delete(msg_id);
                reject(new Error('Worker response timeout'));
            }, timeout_ms);
            this.pending_resolves.set(msg_id, (v) => {
                clearTimeout(timer);
                resolve(v);
            });
            worker.postMessage(msg);
        });
    }


    public  on_message<K extends keyof on_threads_event>(message:K,listener:on_threads_event[K] ) {
        this.event.on(message,listener)
    }
    public  on_once_message<K extends keyof on_threads_event>(message:K,listener:on_threads_event[K] ) {
        this.event.once(message,listener)
    }
    public  off_message<K extends keyof on_threads_event>(message:K,listener:on_threads_event[K] ) {
        this.event.removeListener(message,listener)
    }
    private emit_message<K extends keyof on_threads_event>(
        message: K,
        ...args: Parameters<on_threads_event[K]>
    ) {
        // 举例：调用 EventEmitter
        this.event.emit(message, ...args);
    }


    /**
     * 内部消息分发
     */
    private  handle_message(msg: WorkerMessage, worker: NodeWorker) {
        // 如果带 id，则 resolve 对应 promise
        if (msg.id && this.pending_resolves.has(msg.id)) {
            const fn = this.pending_resolves.get(msg.id)!;
            fn(msg.data);
            this.pending_resolves.delete(msg.id);
        }
        this.emit_message('message',msg,worker)
        this.emit_message(`message_${msg.type}`, msg,worker);
    }

    private async forceTerminateAll() {
        console.log('[main] force terminating all workers...');

        this.running = false; // 防止 exit 自动重启

        const terminatePromises = this.worker_threads.map(w => {
            return w.terminate().catch(() => {});
        });

        await Promise.all(terminatePromises);

        this.worker_threads = [];
        this.pending_resolves.forEach(resolve => {
            resolve(null); // 不执行就会有内存泄露
        })
        this.pending_resolves.clear();
        console.log('[main] workers force terminated');
    }

    public async restart() {
        console.log('[main] restarting worker pool...');
        await this.forceTerminateAll();
        // 等待事件循环释放
        await new Promise(resolve => setTimeout(resolve, 100));
        this.start_worker_threads(this.worker_path, this.worker_num);
        console.log('[main] worker pool restarted');
    }

}
