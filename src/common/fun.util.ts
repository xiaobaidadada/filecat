
// 一个函数防止重复执行，执行期间拒绝第二次执行
export function withLock<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    timeoutMs = 60_000
) {
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
        if (locked) return
        locked = true
        const myToken = token
        timer = setTimeout(() => {
            // console.warn('[withLock] auto unlock by timeout')
            unlock(myToken)
        }, timeoutMs)
        try {
            return await fn(...args)
        } finally {
            unlock(myToken)
        }
    }
}




// 防抖 滚动停的时候用 200毫秒内有新的执行都会失效，最后一个生效
export function debounce(fn, delay = 200) {
    let timer = null; // 由于闭包，这个变量会一直存在，因为返回的是个函数

    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            fn.apply(this, args);
        }, delay);
    };
}

// 节流函数 时间时间内 后面的都不会触发 滚动中可以使用
export function throttle(fn, delay = 200) {
    let last = 0; // 上一次执行时间戳

    return function (...args) {
        const now = Date.now();

        if (now - last >= delay) {
            last = now;
            fn.apply(this, args);
        }
    };
}