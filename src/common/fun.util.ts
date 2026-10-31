





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