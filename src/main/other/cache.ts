import {DataUtil} from "../domain/data/DataUtil";
import {data_common_key} from "../domain/data/data_type";
import {TokenSessionMode} from "../../common/req/setting.req";

export class Cache {

    private static time_len = 1000 * 60 * 60;

    private static valueMap: Map<string, any> = new Map();
    private static timeLenMap: Map<string, number> = new Map();
    private static stampMap: Map<string, number> = new Map();

    /** 是否开启持久化（服务重启后 token 仍然有效） */
    private static persist_open = false;

    /** 登录会话模式，默认独立 token */
    private static session_mode: TokenSessionMode = TokenSessionMode.independent;

    /**
     * username → 该用户名下所有 token 的反向索引。
     *
     * valueMap 的 key 是 token，无法反查某个用户签过哪些 token，
     * 复用模式和单会话模式都依赖这个索引。
     * 索引可能残留已过期/已删除的 token，使用前一律用 getValue 做一次校验。
     */
    private static userTokenMap: Map<string, Set<string>> = new Map();

    public static set_session_mode(mode: TokenSessionMode): void {
        this.session_mode = mode;
    }

    public static get_session_mode(): TokenSessionMode {
        return this.session_mode;
    }

    /** 把 token 登记到用户的索引里 */
    private static index_user_token(username: string, token: string): void {
        let set = this.userTokenMap.get(username);
        if (!set) {
            set = new Set();
            this.userTokenMap.set(username, set);
        }
        set.add(token);
    }

    /** 从索引里移除单个 token，索引空了就删掉这个用户 */
    private static unindex_user_token(username: string, token: string): void {
        const set = this.userTokenMap.get(username);
        if (!set) return;
        set.delete(token);
        if (set.size === 0) this.userTokenMap.delete(username);
    }

    /**
     * 取出该用户当前真正有效的 token（已过期的会被顺手清掉）。
     * @param username
     */
    public static get_user_tokens(username: string): string[] {
        const set = this.userTokenMap.get(username);
        if (!set) return [];
        const alive: string[] = [];
        for (const token of set) {
            let valid = false;
            try {
                valid = this.getValue(token) !== undefined;
            } catch (e) {
                valid = false; // getValue 过期时抛错并已删除
            }
            if (valid) alive.push(token);
            else set.delete(token);
        }
        if (set.size === 0) this.userTokenMap.delete(username);
        return alive;
    }

    /**
     * 删除该用户全部 token。
     * @param username
     */
    public static clear_user_token(username: string): void {
        const set = this.userTokenMap.get(username);
        if (!set) return;
        for (const token of set) {
            this.valueMap.delete(token);
            this.timeLenMap.delete(token);
            this.stampMap.delete(token);
        }
        this.userTokenMap.delete(username);
        this.persist();
    }


    /**
     * 登录时签发 token，按当前会话模式决定返回什么。
     *
     * - independent：总是新建 token，旧的继续有效（多设备）
     * - reuse：该用户已有有效 token 就直接复用，没有才新建
     * - single：必定新建 token，并清掉该用户此前所有 token
     *
     * @param username 用户名
     * @param new_token 由调用方生成的候选 token（随机串）
     * @param value 随 token 一起保存的数据
     * @returns 最终使用的 token
     */
    public static issue_token(username: string, new_token: string, value: any): string {
        if (this.session_mode === TokenSessionMode.reuse) {
            const alive = this.get_user_tokens(username);
            if (alive.length > 0) {
                // 复用已有 token，不新建
                return alive[0];
            }
        } else if (this.session_mode === TokenSessionMode.single) {
            this.clear_user_token(username);
        }
        // independent 与上面两种的“没有可复用 token”分支
        this.setValue(new_token, value);
        this.index_user_token(username, new_token);
        this.persist();
        return new_token;
    }


    private static persist(): void {
        if (!this.persist_open) return;
        const data = {
            valueMap: Object.fromEntries(this.valueMap),
            timeLenMap: Object.fromEntries(this.timeLenMap),
            stampMap: Object.fromEntries(this.stampMap),
            time_len: this.time_len,
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
            time_len?: number;
        }>(data_common_key.token_cache);
        if (!data) return;
        try {
            // 恢复默认过期时长（如永不过期 -1），确保 getValue 判断一致
            if (data.time_len !== undefined) {
                this.time_len = data.time_len;
            }
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
        if (value.username !== undefined) {
            this.unindex_user_token(value.username, key);
        }
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
        const value = this.valueMap.get(key);
        // 同步把 token 从用户索引里摘掉
        if (value && value.username !== undefined) {
            this.unindex_user_token(value.username, key);
        }
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
        this.userTokenMap.clear();
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
