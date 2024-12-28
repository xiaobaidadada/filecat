export class Cache {

    private static time_len = 1000 * 60 * 60;

    private static valueMap: Map<string, any> = new Map();
    private static timeLenMap: Map<string, number> = new Map();
    private static stampMap: Map<string, number> = new Map();

    /**
     * 设置缓存
     * @param key
     * @param value
     * @param time_len_second
     */
    public static setValue(key: string, value: any, time_len_second?: number): void {
        this.valueMap.set(key, value);
        if (time_len_second !== undefined)
            this.timeLenMap.set(key, time_len_second * 1000);
        else {
            this.timeLenMap.set(key, this.time_len);
        }
        this.stampMap.set(key, Date.now());
    }

    /**
     * 更新变量的过期时间
     * @param key
     */
    public static updateStamp(key: string): void {
        this.stampMap.set(key, Date.now());
    }

    /**
     * 过期一个值 并判断是否过期
     * @param key
     */
    public static getValue(key: string): any {
        if (this.time_len === -1) {
            // 没有过期时间

            return this.valueMap.get(key);
        }
        // 有过期时间
        if (this.timeLenMap.get(key) > Date.now() - this.stampMap.get(key)) {
            return this.valueMap.get(key);
        }
        // 过期了
        this.stampMap.delete(key);
        this.timeLenMap.delete(key);
        this.valueMap.delete(key);
        return null;
    }

    /**
     * 设置默认过期时间长度
     * @param len 毫秒
     */
    public static set_default_time_len(len: number): void {
        this.time_len = len;
    }

    /**
     * 清理所有缓存
     */
    public static clear() {
        this.valueMap.clear();
        this.timeLenMap.clear();
        this.stampMap.clear();
    }

    /**
     * 检查token是否过期
     * @param token
     */
    public static check(token) {
        const v = this.getValue(token);
        return v !== null && v !== undefined;
    }
}
