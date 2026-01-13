import { parentPort, workerData } from 'worker_threads';
import { threads_msg_type, WorkerMessage } from './threads.type';
import {file_search_start} from "../domain/file/search/file.search.worker";

console.log('[worker] 子线程启动, workerData=', workerData);

/**
 * handler map
 * key = msg.type
 * value = async function(msg) => void
 */
const handlers = new Map<threads_msg_type, (msg: WorkerMessage) => Promise<any>>();

/**
 * 注册消息处理函数
 * @param type 消息类型
 * @param fn async 处理函数，返回值会被发回主线程
 */
export function register_threads_worker_handler(type: threads_msg_type, fn: (msg: WorkerMessage) => Promise<any>) {
    handlers.set(type, fn);
}

/**
 * 向主线程发送消息
 * @param msg
 */
export function threads_send(msg: WorkerMessage) {
    try {
        parentPort?.postMessage(msg);
    } catch (err) {
        console.error('[worker] send failed:', err);
    }
}

/**
 * 处理消息
 */
async function handleMessage(msg: WorkerMessage) {
    try {
        const fn = handlers.get(msg.type);
        if (!fn) {
            // 未注册处理函数
            threads_send({ id: msg.id, type: msg.type, data: `unknown type ${msg.type}` });
            return;
        }

        const result = await fn(msg);
        threads_send({ id: msg.id, type: msg.type, data: result });
    } catch (err: any) {
        // 捕获异常并回传
        threads_send({ id: msg.id, type: msg.type, data: null, error: err?.message || String(err) });
        console.error('[worker] task error:', err);
    }
}

// 注册主线程消息监听
parentPort?.on('message', (msg: WorkerMessage) => {
    handleMessage(msg);
});

// ------------------ 示例：注册处理函数 ------------------
// 在这里注册各种消息类型 也可以直接使用send函数
register_threads_worker_handler(threads_msg_type.hello, async (msg) => {
    return new Promise((res, rej) =>
        setTimeout(() => {
            if (Math.random() < 0.05) return rej(new Error('模拟错误'));
            res(`done:${msg.data}`);
        }, 500)
    );
});
file_search_start()
console.log('[worker] ready and waiting for messages...');
