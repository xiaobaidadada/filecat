
const lockQueue = new Map<string, Promise<any>>();


export class CommonUtil {

    public static sleep(ms:number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 同一个 key 会被锁 直到上一个解锁
    public static async sleep_lock_key(key: string, ms: number) {
        // 取出上一个
        const prev = lockQueue.get(key) || Promise.resolve();

        let release!: () => void;

        // 当前任务的 promise（用于挂到队列）
        const current = new Promise<void>(resolve => {
            release = resolve;
        });

        // 把自己挂到队列尾
        lockQueue.set(key, prev.then(() => current));

        // 等待前面的执行完
        await prev;

        try {
            // 🔥 你的“占用时间”
            await new Promise(r => setTimeout(r, ms));
        } finally {
            // 释放当前锁
            release();

            // 如果当前是最后一个，清理 key
            if (lockQueue.get(key) === current) {
                lockQueue.delete(key);
            }
        }
    }

     public static random01() {
        return Math.random();
    }

}


// Promise.all([
//     CommonUtil.sleep_lock_key('a', 1000),
//     CommonUtil.sleep_lock_key('a', 1000),
//     CommonUtil.sleep_lock_key('a', 1000),
// ]);