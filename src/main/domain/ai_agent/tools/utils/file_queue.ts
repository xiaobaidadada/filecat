/**
 * 按文件路径的写操作队列。
 *
 * 同一轮对话里模型可能一次返回多个文件工具调用，chat.core 用 Promise.all
 * 并发执行。两个针对同一个文件的写操作会各自读到旧内容再依次写回，后写的
 * 把先写的覆盖掉。这里按路径把写操作排成队列依次执行，保证读写不被打断。
 */

interface queue_item {
    /** 队列尾部的任务，新任务挂在这后面 */
    tail: Promise<any>;
    /** 队列中还没执行完的任务数 */
    size: number;
}

const file_queues = new Map<string, queue_item>();

// 仅供测试验证队列清理，业务代码不要使用
export const file_queues_for_test = file_queues;

/** 把任务排进指定路径的队列，返回该任务自身的 Promise */
export function enqueue_file_task<T>(path: string, fn: () => Promise<T>): Promise<T> {
    let queue = file_queues.get(path);
    if (!queue) {
        queue = { tail: Promise.resolve(), size: 0 };
        file_queues.set(path, queue);
    }
    queue.size++;
    // 前一个任务无论成功失败都要让出位置，否则队列会卡死
    const task = queue.tail.catch(() => undefined).then(fn);
    queue.tail = task;
    task.finally(() => {
        queue!.size--;
        // 队列空了就移除，避免 Map 无限增长
        if (queue!.size === 0 && file_queues.get(path) === queue) {
            file_queues.delete(path);
        }
    });
    return task;
}
