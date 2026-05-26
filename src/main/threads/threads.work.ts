import { parentPort, workerData } from 'worker_threads';
import { threads_msg_type, WorkerMessage } from './threads.type';

console.log('[worker] 子线程启动, workerData=', workerData);

/**
 * handler map
 * key = msg.type
 * value = async function(msg) => void
 */
const handlers = new Map<threads_msg_type, (msg: WorkerMessage) => Promise<any>>();

// 👇 新增：用于子线程主动发起请求时的 ID 生成与 Promise 映射
let next_msg_id = 1;
const pending_resolves = new Map<number, (v: any) => void>();

function get_next_msg_id(): number {
    return next_msg_id++;
}

/**
 * 注册消息处理函数
 * @param type 消息类型
 * @param fn async 处理函数，返回值会被发回主线程
 */
export function register_threads_worker_handler(type: threads_msg_type, fn: (msg: WorkerMessage) => Promise<any>) {
    handlers.set(type, fn);
}

// threads.work.ts

/**
 * 向主线程发送消息（支持零拷贝转移）
 * @param msg 消息体
 * @param transferList 可转移的 ArrayBuffer 数组
 */
export function threads_send(msg: WorkerMessage, transferList?: ArrayBuffer[]) {
    try {
        parentPort?.postMessage(msg, transferList);
    } catch (err) {
        console.error('[worker] send failed:', err);
    }
}

/**
 * ⭐ 新增：向主线程异步发送消息并等待返回结果 (支持零拷贝)
 * @param msg_type 消息类型
 * @param data 消息数据
 * @param timeout_ms 超时时间，默认 5000 毫秒
 * @param transferList 可转移对象
 */
export async function threads_send_async(
    msg_type: threads_msg_type,
    data: any,
    timeout_ms = 5000,
    transferList?: ArrayBuffer[]
): Promise<any> {
    const msg_id = get_next_msg_id();
    const msg: WorkerMessage = { id: msg_id, type: msg_type, data };

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending_resolves.delete(msg_id);
            reject(new Error(`[worker] Request to main thread timeout (type: ${msg_type}, id: ${msg_id})`));
        }, timeout_ms);

        pending_resolves.set(msg_id, (v) => {
            clearTimeout(timer);
            resolve(v);
            pending_resolves.delete(msg_id);
        });

        try {
            threads_send(msg, transferList);
        } catch (err) {
            clearTimeout(timer);
            pending_resolves.delete(msg_id);
            reject(err);
        }
    });
}

/**
 * 处理消息
 */
async function handleMessage(msg: WorkerMessage) {
    try {
        // 👇 核心拦截：如果主线程发来的消息带有 id，且属于子线程之前挂起的异步请求的响应
        if (msg.id && pending_resolves.has(msg.id)) {
            const resolveFn = pending_resolves.get(msg.id)!;
            // 如果主线程传回了异常错误，这里抛出
            if (msg.error) {
                console.error(`[worker] received error from main: ${msg.error}`);
            }
            resolveFn(msg.data);
            return; // 响应处理完毕，直接截断不再去找对应的 handler
        }

        // 否则，说明是主线程主动派发过来的任务，走原有逻辑
        const fn = handlers.get(msg.type);
        if (!fn) {
            threads_send({ id: msg.id, type: msg.type, data: `unknown type ${msg.type}` });
            return;
        }

        const result = await fn(msg);

        // 只有当主线程传了 id 过来（代表主线程在 await 结果），才需要给主线程回传带 id 的消息
        if (msg.id) {
            threads_send({ id: msg.id, type: msg.type, data: result });
        }
    } catch (err: any) {
        if (msg.id) {
            threads_send({ id: msg.id, type: msg.type, data: null, error: err?.message || String(err) });
        }
        console.error('[worker] task error:', err);
    }
}

// 注册主线程消息监听
parentPort?.on('message', (msg: WorkerMessage) => {
    handleMessage(msg).catch(console.error);
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
console.log('[worker] ready and waiting for messages...');

process.on('uncaughtException', (err) => {
    console.error('子线程全局未捕获异常:', err);
    // 可以选择继续运行
});

process.on('unhandledRejection', (reason) => {
    console.error('子线程未处理的 Promise 拒绝:', reason);
});

