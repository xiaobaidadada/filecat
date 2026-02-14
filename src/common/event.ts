type Listener = (...args: any[]) => void;

export class EventEmitter {
    private _events: Record<string, Listener[]> = {};

    // 监听事件
    on(event: string, listener: Listener): this {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(listener);
        return this;
    }

    // 只触发一次
    once(event: string, listener: Listener): this {
        const wrapper: Listener = (...args: any[]) => {
            listener(...args);
            this.off(event, wrapper);
        };
        return this.on(event, wrapper);
    }

    // 移除监听
    off(event: string, listener: Listener): this {
        const listeners = this._events[event];
        if (!listeners) return this;
        this._events[event] = listeners.filter(l => l !== listener);
        return this;
    }

    off_all(event: string): this {
        delete this._events[event];
        return this;
    }

    // 触发事件，支持多参数
    emit(event: string, ...args: any[]): boolean {
        const listeners = this._events[event];
        if (!listeners || listeners.length === 0) return false;
        [...listeners].forEach(listener => {
            try {
                listener(...args);
            } catch (err) {
                console.error(`Error in listener for event "${event}":`, err);
            }
        });
        return true;
    }
}


// interface MyEvents {
//     ping: (msg: string, count: number) => void;
//     pong: (num: number) => void;
// }
//
// const emitter = new EventEmitter();
//
// emitter.on('ping', (msg, count) => {
//     console.log('ping received:', msg, count);
// });
//
// emitter.once('pong', num => {
//     console.log('once pong:', num);
// });
//
// emitter.emit('ping', 'hello', 5);
// // 输出: ping received: hello 5
//
// emitter.emit('pong', 42);
// // 输出: once pong: 42
//
// emitter.emit('pong', 99);
// // 不会再输出
