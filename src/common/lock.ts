// 一个函数防止重复执行，执行期间拒绝第二次执行
export function withLock<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    timeoutMs?: number, // 小于0的话 没有过期时间
    throw_err?: boolean
) {
    if (timeoutMs == null) {
        timeoutMs = 60_000;
    }
    // 这个函数返回一次，由于闭包，这里的变量会永久存在，除非返回的函数引用消失
    let locked = false
    let timer: NodeJS.Timeout | null = null
    let token = 0 // finally和 setTimeout 其中只能有一个可以解锁成功,都解锁成功，在下一个token执行的时候，防止提前解锁下一个函数
    function unlock(myToken: number) {
        if (!locked || token !== myToken) return
        locked = false
        token++
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    }

    return async function (
        ...args: Parameters<T>
    ): Promise<ReturnType<T> | undefined> {
        // 前面的变量永远不会消失，这里才是利用这些变量的具体逻辑实现
        if (locked) return
        locked = true
        const myToken = token
        if (timeoutMs >= 0) {
            timer = setTimeout(() => {
                // console.warn('[withLock] auto unlock by timeout')
                unlock(myToken)
            }, timeoutMs)
        }
        try {
            return await fn(...args)
        } catch (e) {
            console.log(e?.message || e)
            if (throw_err)
                throw e;
        } finally {
            unlock(myToken)
        }
    }
}

/**
 * 会话读写的串行化锁。
 * 会话文件是「读全文 → 改字段 → 覆盖写全文」的模式，多个请求并发时会互相覆盖，
 * 运行中的会话尤其明显（`appendTurn` 落盘前，其它接口读到的是旧快照）。
 * 这里按 sessionId 串行排队，保证同一会话的读改写不会交错。
 */
export class RWLock {
    private tails = new Map<string, Promise<unknown>>();

    run<T>(key: string, task: () => Promise<T>): Promise<T> {
        const prev = this.tails.get(key) ?? Promise.resolve();
        const next = prev.then(task, task);
        // 无论成败都推进队列，且不让失败污染后续任务
        this.tails.set(key, next.catch(() => undefined));
        next.catch(() => undefined).then(() => {
            if (this.tails.get(key) === next) {
                this.tails.delete(key);
            }
        });
        return next;
    }
}