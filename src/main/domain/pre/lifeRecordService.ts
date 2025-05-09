
const max_life_len = 1000 * 60 * 5;
// 生命周期管理
export class LifecycleRecordService {
    // 数据map
    private dataMap: Map<string, any> = new Map();
    // 心跳map
    private heatMap: Map<string, number> = new Map();
    // 结束事件
    private endMap: Map<string, (data: any) => Promise<void>> = new Map();
    // 一直不过期
    private forEveryMap: Set<string> = new Set<string>();
    private timer;

    /**
     * 生命事件开始
     * 超过三分钟没有维护就会触发断开
     * @param id
     * @param data
     * @param endHandler
     */
    lifeStart(id: string, data?: any, endHandler?: (data: any) => Promise<void>) {
        if (data) {
            this.dataMap.set(id, data);
        }
        if (endHandler) {
            this.endMap.set(id, endHandler);
        }
        this.heatMap.set(id, Date.now());
        if (!this.timer) {
            this.timer = setInterval(async () => {
                try {
                    if (this.heatMap.size === 0) {
                        clearInterval(this.timer);
                        this.timer = null;
                        return;
                    }
                    const now = Date.now();
                    for (const key of this.heatMap.keys()) {
                        const stamp = this.heatMap.get(key);
                        if (!this.forEveryMap.has(key) && ((now - stamp) > max_life_len)) {
                            // 超过五分钟了
                            await this.lifeClose(key);
                        }
                    }
                } catch (e) {
                    console.log(e)
                }
            }, 1000 * 3)
        }
    }

    lifeGetData(key: string): any {
        return this.dataMap.get(key);
    }

    /**
     * 维持生命周期事件
     * @param key
     */
    lifeHeart(key: string) {
        if (this.heatMap.has(key)) {
            this.heatMap.set(key, Date.now());
        }
    }

    forEveryLifeHeart(key: string) {
        this.forEveryMap.add(key);
    }

    endForEveryLifeHeart(key: string) {
        this.forEveryMap.delete(key);
    }

    /**
     * 主动断开生命周期事件
     * @param key
     */
    async lifeClose(key: string) {
        const endh = this.endMap.get(key);
        if (endh) {
            await endh(this.dataMap.get(key));
        }
        this.heatMap.delete(key);
        this.endMap.delete(key);
        this.dataMap.delete(key);
    }

    async asyncExec(fun: (resolve, reject) => void, outtime: number = 1000 * 3) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                resolve(null);
            }, outtime)
            const resolve1 = (data) => {
                clearTimeout(timer);
                return resolve(data);
            }
            fun(resolve1, reject);
        })
    }
}
