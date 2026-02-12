import { Worker as NodeWorker, parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs'
import {threads_msg_type, WorkerMessage} from "./threads.type";


export class ThreadsMain {
    private  worker_threads: NodeWorker[] = [];
    private  next_msg_id = 1;
    private  pending_resolves = new Map<number, (v: any) => void>();
    private  global_listeners: ((msg: WorkerMessage, worker: NodeWorker) => void)[] = [];
    private  global_listeners_id_map = new Map();
    private  global_once_listeners: ((msg: WorkerMessage, worker: NodeWorker) => void)[] = [];
    private  global_once_listeners_map = new Map<threads_msg_type,((msg: WorkerMessage, worker: NodeWorker) => void)>()
    private  running = false;
    private worker_path: string = "";
    private worker_num: number = 1;
    private _exit_worker_num = 0



    public   generate_random_id(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    /**
     * 启动 worker 线程
     */
    public  start_worker_threads(worker_path: string = "threads.worker.js", num = 1) {
        console.log('[main] 主线程启动',worker_path);
        const absPath = worker_path;
        if(!fs.existsSync(absPath)) {
            console.log('子线程路径不存在',absPath);
            return false
        }
        this.worker_path = worker_path;
        this.worker_num = num;
        this.running = true;
        this._exit_worker_num = 0;
        for (let i = 0; i < num; i++) {
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
            worker.on('message', (msg: WorkerMessage) => this.handle_message(msg, worker));
            worker.on('exit', (code) => {
                console.log(`[main] worker exited code=${code}, restarting...`);
                this._exit_worker_num ++;
                // if(!this.running) return; // 没有开启就不重启
                // // 自动重启
                // const index = this.worker_threads.indexOf(worker);
                // if (index >= 0) this.worker_threads.splice(index, 1);
                // (async ()=>{
                //     await new Promise(resolve => setTimeout(resolve, 20000));
                //     this.start_worker_threads(worker_path, 1);
                // })();
            });
            worker.on('error', (err) => console.error('[main] worker error:', err));
            this.worker_threads.push(worker);
        }
        return true
    }

    public  get is_running(): boolean {
        return this.running;
    }

    public get exit_worker_num(): number {
        return this._exit_worker_num;
    }

    /**
     * 关闭所有 worker
     */
    public  async close() {
        console.log('[main] closing all workers...');
        this.running = false;
        const closePromises = this.worker_threads.map(
            (w) =>
                new Promise<void>((resolve) => {
                    w.once('exit', () => resolve());
                    w.terminate(); // 发送 terminate 信号
                })
        );
        await Promise.all(closePromises);
        this.worker_threads.length = 0;
        this._exit_worker_num = this.worker_num;
        this.pending_resolves.clear();
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
        if(this.next_msg_id > 1000000000) {
            this.next_msg_id = 0
        } else {
            this.next_msg_id++;
        }
        return this.next_msg_id;
    }

    private  get_one_worker_threads(): number {
        if(this.worker_threads.length === 1) return 0
        // 采用随机返回
        return Math.floor(Math.random() * this.worker_threads.length)
    }

    /**
     * 发送消息并 await 子线程返回结果
     */
    public  async post(msg_type: threads_msg_type, data: any, timeout_ms = 2000): Promise<any> {
        if (this.worker_threads.length === 0) throw new Error('No worker threads started');
        const msg_id = this.get_next_msg_id()
        const msg: WorkerMessage = { id: msg_id, type: msg_type, data };
        const worker = this.worker_threads[this.get_one_worker_threads()];
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

    /**
     * 注册全局 listener（所有 worker 都能触发）
     */
    public  on(listener: (msg: WorkerMessage, worker: NodeWorker) => void,on_id?:string) {
        this.global_listeners.push(listener);
        if(on_id) {
            this.global_listeners_id_map.set(on_id, listener);
        }
    }

    public  off_by_listener(listener: (msg: WorkerMessage, worker: NodeWorker) => void) {
        const index = this.global_listeners.indexOf(listener);
        if (index >= 0) {
            this.global_listeners.splice(index, 1);
        }
    }

    public  off_by_listener_id(on_id:string) {
        const listener = this.global_listeners_id_map.get(on_id);
        const index = this.global_listeners.indexOf(listener);
        if (index >= 0) {
            this.global_listeners.splice(index, 1);
        }
    }


    /**
     * 注册一次性 listener
     */
    public  on_once(listener: (msg: WorkerMessage, worker: NodeWorker) => void) {
        this.global_once_listeners.push(listener);
    }

    public  on_once_msg(type:threads_msg_type,listener: (msg: WorkerMessage, worker: NodeWorker) => void) {
        this.global_once_listeners_map.set(type, listener);
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
        // 调用全局 listener
        for (const fn of this.global_listeners) {
            fn(msg, worker);
        }
        if(this.global_once_listeners_map.has(msg.type)) {
            this.global_once_listeners_map.get(msg.type)(msg,worker)
            this.global_once_listeners_map.delete(msg.type);
        }
        // 调用一次性 listener
        if (this.global_once_listeners.length > 0) {
            const fns = [...this.global_once_listeners];
            this.global_once_listeners.length = 0;
            for (const fn of fns) fn(msg, worker);
        }
    }

    private async forceTerminateAll() {
        console.log('[main] force terminating all workers...');

        this.running = false; // 防止 exit 自动重启

        const terminatePromises = this.worker_threads.map(w => {
            return w.terminate().catch(() => {});
        });

        await Promise.all(terminatePromises);

        this.worker_threads = [];
        this.pending_resolves.clear();
        this.global_listeners = [];
        this.global_once_listeners = [];
        this.global_once_listeners_map.clear();

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
