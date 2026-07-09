import {DataUtil} from "../domain/data/DataUtil";
import {data_common_key} from "../domain/data/data_type";

export class Cache {

    private static time_len = 1000 * 60 * 60;

    private static valueMap: Map<string, any> = new Map();
    private static timeLenMap: Map<string, number> = new Map();
    private static stampMap: Map<string, number> = new Map();

    /** 是否开启持久化（服务重启后 token 仍然有效） */
    private static persist_open = false;


    /**
     * 持久化 token 到文件（通过 DataUtil）
     * 仅在新建 token、过期删除、修改过期模式、清空时调用，频率很低
     */
    private static persist(): void {
        if (!this.persist_open) return;
        const data = {
            valueMap: Object.fromEntries(this.valueMap),
            timeLenMap: Object.fromEntries(this.timeLenMap),
            stampMap: Object.fromEntries(this.stampMap),
        };
        DataUtil.set(data_common_key.token_cache, data);
    }

    /**
     * 从文件恢复 token 缓存（通过 DataUtil）
     * 在服务启动时调用
     */
    public static restore(): void {
        // 先恢复持久化开关
        const config = DataUtil.get<{ persist?: boolean }>(data_common_key.token_setting);
        if (config && config.persist) this.persist_open = true;
        if (!this.persist_open) return;
        const data = DataUtil.get<{
            valueMap?: Record<string, any>;
            timeLenMap?: Record<string, number>;
            stampMap?: Record<string, number>;
        }>(data_common_key.token_cache);
        if (!data) return;
        try {
            if (data.valueMap) {
                this.valueMap = new Map(Object.entries(data.valueMap));
            }
            if (data.timeLenMap) {
                this.timeLenMap = new Map(Object.entries(data.timeLenMap));
            }
            if (data.stampMap) {
                this.stampMap = new Map(Object.entries(data.stampMap));
            }
        } catch (e) {
            console.log('token 缓存恢复失败', e);
        }
    }

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
        this.persist();
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
        const value = this.valueMap.get(key);
        if (!value) return undefined; // 不存在key值返回空值
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
        this.persist();
        throw "out of date";
    }

    /**
     * 设置默认过期时间长度
     * @param len 毫秒
     */
    public static set_default_time_len(len: number): void {
        this.time_len = len;
        this.persist();
    }

    /**
     * 删除单个 token
     */
    public static deleteValue(key: string): void {
        this.valueMap.delete(key);
        this.timeLenMap.delete(key);
        this.stampMap.delete(key);
        this.persist();
    }

    /**
     * 清理所有缓存
     */
    public static clear() {
        this.valueMap.clear();
        this.timeLenMap.clear();
        this.stampMap.clear();
        this.persist();
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
