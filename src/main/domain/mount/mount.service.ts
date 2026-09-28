import {DataUtil} from "../data/DataUtil";
import {data_common_key} from "../data/data_type";
import {FileMountItem, find_mount, MountMatch} from "./mount.pojo";
import {
    CredentialItem,
    CredentialMeta,
    CredentialType,
    CREDENTIAL_META_LIST,
    DRIVER_CREDENTIAL_TYPE,
    get_credential_meta,
} from "./credential.pojo";
import {get_driver, dispose_driver, dispose_all_drivers, create_test_driver} from "./driver/driver_factory";
import {FileDriver, MountDriverType} from "./driver/file_driver";
import {DriverMeta, DRIVER_META_LIST} from "./driver/file_driver_type";
import {
    BaiduTokenStore,
    PublicBaiduAccount,
    PublicBaiduApp,
    BaiduAppConfig,
} from "./baidu/baidu_token";

/**
 * 挂载服务。
 *
 * 两层结构：
 *  · 凭据（Credential）—— 账号/身份信息，在设置页统一管理，可被多个挂载复用
 *  · 挂载（Mount）—— 「把哪个本地目录接到哪份凭据上」
 *
 * 所有文件操作都通过 resolve() 拿到 MountMatch 后转发给驱动，
 * 业务层不需要知道具体是哪种网盘。
 */
export class MountService {

    /** 总开关内存缓存；undefined 表示尚未从存储中读取 */
    private enabled_cache: boolean | undefined = undefined;

    // ==================== 凭据管理 ====================

    /** 取全部凭据 */
    list_credentials(): CredentialItem[] {
        return DataUtil.get<CredentialItem[]>(data_common_key.mount_credential_list) ?? [];
    }

    private set_credentials(list: CredentialItem[]): void {
        DataUtil.set(data_common_key.mount_credential_list, list);
    }

    /** 取某个凭据 */
    get_credential(id: string): CredentialItem | undefined {
        return this.list_credentials().find(v => v.id === id);
    }

    /** 新增凭据 */
    add_credential(item: Omit<CredentialItem, "id" | "created_at">): CredentialItem {
        const list = this.list_credentials();
        const full: CredentialItem = {
            ...item,
            id: `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            created_at: Date.now(),
        };
        list.push(full);
        this.set_credentials(list);
        return full;
    }

    /** 修改凭据；config 为部分更新（密码留空表示不改） */
    update_credential(id: string, patch: Partial<CredentialItem>): CredentialItem {
        const list = this.list_credentials();
        const i = list.findIndex(v => v.id === id);
        if (i < 0) {
            throw new Error("凭据不存在");
        }
        const old = list[i];
        // config 做合并：新值里为空字符串的字段保留旧值（避免编辑时把密码清空）
        let config = old.config;
        if (patch.config) {
            config = {...old.config};
            for (const [k, v] of Object.entries(patch.config)) {
                if (v === "" || v === undefined || v === null) {
                    continue;
                }
                config[k] = v;
            }
        }
        list[i] = {
            ...old,
            name: patch.name ?? old.name,
            enabled: patch.enabled ?? old.enabled,
            config,
        };
        this.set_credentials(list);
        // 凭据变了：引用它的挂载驱动都要重建
        this.dispose_by_credential(id);
        return list[i];
    }

    /** 删除凭据。若仍被挂载引用，拒绝删除（避免挂载突然失效） */
    remove_credential(id: string): void {
        const used = this.list_raw().filter(m => m.credential_id === id);
        if (used.length) {
            const names = used.map(m => m.name || m.mount_path).join("、");
            throw new Error(`该凭据正被以下挂载使用，请先删除对应挂载：${names}`);
        }
        this.set_credentials(this.list_credentials().filter(v => v.id !== id));
    }

    /** 释放引用了某凭据的全部驱动实例 */
    private dispose_by_credential(cred_id: string): void {
        for (const m of this.list_raw()) {
            if (m.credential_id === cred_id) {
                dispose_driver(m.id);
            }
        }
    }

    /** 取指定用户可见的凭据；is_root 可看全部 */
    list_credentials_for_user(user_id?: string, is_root?: boolean): CredentialItem[] {
        const all = this.list_credentials();
        if (is_root) {
            return all;
        }
        return all.filter(v => !v.user_id || v.user_id === user_id);
    }

    /** 凭据类型元信息（供设置页渲染动态表单） */
    credential_metas(): CredentialMeta[] {
        return CREDENTIAL_META_LIST;
    }

    // ==================== 挂载管理 ====================

    /**
     * 挂载功能总开关。
     * 关闭后所有挂载都不生效，路径解析直接短路（不查数据库、不做匹配），
     * 全部目录按本地目录处理。
     *
     * 读开关走内存缓存（文件操作是高频路径），由 set_enabled 负责刷新。
     */
    is_enabled(): boolean {
        if (this.enabled_cache === undefined) {
            // 未配置过时默认为关闭：没配过挂载的用户不必产生任何挂载相关的查询开销
            this.enabled_cache = DataUtil.get<boolean>(data_common_key.mount_enabled) === true;
        }
        return this.enabled_cache;
    }

    /** 设置挂载总开关；关闭时释放所有已建立的驱动连接 */
    set_enabled(enabled: boolean): void {
        DataUtil.set(data_common_key.mount_enabled, enabled);
        this.enabled_cache = enabled;
        if (!enabled) {
            dispose_all_drivers();
        }
    }

    /** 取全部挂载记录；总开关关闭时返回空列表（调用方自然短路） */
    list(): FileMountItem[] {
        if (!this.is_enabled()) {
            return [];
        }
        return DataUtil.get<FileMountItem[]>(data_common_key.file_mount_list) ?? [];
    }

    /** 取全部挂载记录（不受总开关影响，设置页管理用） */
    list_raw(): FileMountItem[] {
        return DataUtil.get<FileMountItem[]>(data_common_key.file_mount_list) ?? [];
    }

    private set_list(list: FileMountItem[]): void {
        DataUtil.set(data_common_key.file_mount_list, list);
    }

    /** 按 id 取挂载记录（设置页管理用，不受总开关影响） */
    get(id: string): FileMountItem | undefined {
        return this.list_raw().find(v => v.id === id);
    }

    /** 取指定用户可见的挂载记录；is_root 可看全部；raw 为 true 时不受总开关影响（设置页用） */
    list_for_user(user_id?: string, is_root?: boolean, raw?: boolean): FileMountItem[] {
        const all = raw ? this.list_raw() : this.list();
        if (is_root) {
            return all;
        }
        // 普通用户只能看到自己创建的挂载；未记录创建者的视为公共
        return all.filter(v => !v.user_id || v.user_id === user_id);
    }

    /** 新增挂载 */
    add(item: Omit<FileMountItem, "id" | "created_at">): FileMountItem {
        const list = this.list_raw();
        // 同一个本地目录不允许重复挂载
        const dup = list.find(v => v.mount_path === item.mount_path);
        if (dup) {
            throw new Error(`该目录已被挂载（${dup.name || dup.mount_path}），请先取消原有挂载`);
        }
        const err = this.validate_mount_credential(item.driver, item.credential_id);
        if (err) {
            throw new Error(err);
        }
        const full: FileMountItem = {
            ...item,
            id: `mnt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            created_at: Date.now(),
        };
        list.push(full);
        this.set_list(list);
        return full;
    }

    /** 修改挂载 */
    update(id: string, patch: Partial<FileMountItem>): FileMountItem {
        const list = this.list_raw();
        const i = list.findIndex(v => v.id === id);
        if (i < 0) {
            throw new Error("挂载不存在");
        }
        // mount_path 改了要检查冲突
        if (patch.mount_path && patch.mount_path !== list[i].mount_path) {
            const dup = list.find(v => v.id !== id && v.mount_path === patch.mount_path);
            if (dup) {
                throw new Error("目标目录已被其它挂载占用");
            }
        }
        if (patch.credential_id || patch.driver) {
            const err = this.validate_mount_credential(patch.driver ?? list[i].driver,
                patch.credential_id ?? list[i].credential_id);
            if (err) {
                throw new Error(err);
            }
        }
        list[i] = {...list[i], ...patch, id, created_at: list[i].created_at};
        this.set_list(list);
        // 配置变了，释放旧驱动（下次访问会用新配置重建）
        dispose_driver(id);
        return list[i];
    }

    /** 删除挂载（占用的本地目录恢复成本地目录） */
    remove(id: string): void {
        const list = this.list_raw();
        const i = list.findIndex(v => v.id === id);
        if (i < 0) {
            return;
        }
        list.splice(i, 1);
        this.set_list(list);
        dispose_driver(id);
    }

    // ==================== 路径解析 ====================

    /**
     * 统一解析：给定本地绝对路径，判断它是否落在某个挂载点内。
     * 命中返回匹配信息（含相对路径），未命中返回 null（表示按本地文件处理）。
     */
    resolve(abs_path: string): MountMatch | null {
        return find_mount(abs_path, this.list());
    }

    /**
     * 按挂载记录取驱动实例。
     * 百度网盘特殊：挂载的 credential_id 直接是授权账号 uk，不查凭据表；
     * 其他驱动走凭据表，凭据缺失或停用时会抛出明确错误，避免难以定位的失败。
     */
    driver_of(mount: FileMountItem): FileDriver {
        const cred = this.credential_of(mount);
        if (!cred) {
            throw new Error(`挂载「${mount.name || mount.mount_path}」引用的凭据已不存在，请重新配置`);
        }
        if (cred.enabled === false) {
            throw new Error(`挂载「${mount.name || mount.mount_path}」的凭据已停用`);
        }
        return get_driver(mount, cred);
    }

    /**
     * 取挂载实际使用的「凭据形态」。
     * 百度网盘：把授权账号 uk 包装成 {config:{account_key}}，账号不存在返回 undefined；
     * 其他驱动：正常查凭据表。
     */
    private credential_of(mount: FileMountItem): CredentialItem | undefined {
        if (mount.driver === MountDriverType.baidu) {
            const acc = new BaiduTokenStore().get_account(Number(mount.credential_id));
            if (!acc) {
                return undefined;
            }
            // 这里只是把账号包成「凭据形态」传给驱动工厂
            return {
                id: mount.credential_id,
                type: "baidu_account",
                name: acc.name || acc.baidu_name || String(acc.uk),
                config: {account_key: String(acc.uk)},
                enabled: acc.enabled !== false,
            };
        }
        return this.get_credential(mount.credential_id);
    }

    /** 校验挂载引用的凭据/账号是否存在，返回错误信息；合法返回 undefined */
    private validate_mount_credential(driver: string, credential_id: string): string | undefined {
        if (driver === MountDriverType.baidu) {
            return new BaiduTokenStore().get_account(Number(credential_id))
                ? undefined
                : (credential_id ? "所选百度账号不存在" : "请选择百度账号");
        }
        return this.get_credential(credential_id) ? undefined : "所选凭据不存在";
    }

    /** 驱动元信息（挂载类型下拉用） */
    driver_metas(): DriverMeta[] {
        return DRIVER_META_LIST;
    }

    /** 驱动类型 → 该类型需要选的凭据类型 */
    driver_credential_type(driver: MountDriverType): CredentialType | undefined {
        return DRIVER_CREDENTIAL_TYPE[driver];
    }

    /**
     * 测试连接：用「尚未保存的挂载表单 + 它引用的凭据」试着列一次根目录。
     * 用于前端保存前验证配置，避免存了错配置后才发现。
     */
    async test_connection(req: {
        driver?: MountDriverType;
        credential_id?: string;
        root_dir?: string;
        id?: string;
    }): Promise<{ok: boolean; error?: string; count?: number}> {
        try {
            let mount: FileMountItem;
            if (req.id) {
                const old = this.get(req.id);
                if (!old) {
                    return {ok: false, error: "挂载不存在"};
                }
                mount = {
                    ...old,
                    driver: req.driver ?? old.driver,
                    credential_id: req.credential_id ?? old.credential_id,
                    root_dir: req.root_dir ?? old.root_dir,
                };
            } else {
                if (!req.driver) {
                    return {ok: false, error: "缺少挂载类型"};
                }
                mount = {
                    id: "test_connection",
                    driver: req.driver,
                    mount_path: "",
                    credential_id: req.credential_id ?? "",
                    root_dir: req.root_dir,
                };
            }
            const cred = mount.driver === MountDriverType.baidu
                ? this.credential_of(mount)
                : this.get_credential(mount.credential_id);
            if (!cred) {
                return {ok: false, error: mount.driver === MountDriverType.baidu ? "请选择百度账号" : "请选择凭据"};
            }
            // 测试用创建后立即丢弃，避免污染缓存（凭据可能填错）
            const driver = create_test_driver(mount, cred);
            const items = await driver.list("/");
            try {
                (driver as any).dispose?.();
            } catch (e) {
                // ignore
            }
            return {ok: true, count: items.length};
        } catch (e) {
            return {ok: false, error: e?.message ?? "连接失败"};
        }
    }

    /**
     * 测试凭据：用一份「尚未保存」的凭据配置试连一次。
     * 凭据本身不含挂载信息，所以需要一个驱动类型才能试（默认用对应类型 + 根目录）。
     */
    async test_credential(req: {
        id?: string;
        type?: CredentialType;
        config?: Record<string, any>;
        driver?: MountDriverType;
    }): Promise<{ok: boolean; error?: string; count?: number}> {
        try {
            const type = req.type ?? (req.driver ? DRIVER_CREDENTIAL_TYPE[req.driver] : undefined);
            if (!type) {
                return {ok: false, error: "缺少凭据类型"};
            }
            // 找到能用这份凭据的驱动类型
            const driver_type = req.driver ?? (Object.entries(DRIVER_CREDENTIAL_TYPE)
                .find(([, v]) => v === type)?.[0] as MountDriverType);
            if (!driver_type) {
                return {ok: false, error: "该凭据类型暂不支持测试"};
            }
            // 编辑已有凭据时，未填的密码类字段要用已保存的值补齐
            let config = req.config ?? {};
            if (req.id) {
                const old = this.get_credential(req.id);
                if (old) {
                    const merged = {...old.config};
                    for (const [k, v] of Object.entries(config)) {
                        if (v === "" || v === undefined || v === null) {
                            continue;
                        }
                        merged[k] = v;
                    }
                    config = merged;
                }
            }
            const mount: FileMountItem = {
                id: "test_credential",
                driver: driver_type,
                mount_path: "",
                credential_id: "",
                root_dir: "",
            };
            const cred: CredentialItem = {
                id: "test_credential",
                type,
                name: "test",
                config,
            };
            const driver = create_test_driver(mount, cred);
            const items = await driver.list("/");
            try {
                (driver as any).dispose?.();
            } catch (e) {
                // ignore
            }
            return {ok: true, count: items.length};
        } catch (e) {
            return {ok: false, error: e?.message ?? "连接失败"};
        }
    }

    // ==================== 百度网盘应用授权 ====================

    /** 百度应用配置（脱敏）+ 全部已授权账号 */
    get_baidu_app(): {app: PublicBaiduApp; accounts: PublicBaiduAccount[]} {
        const store = new BaiduTokenStore();
        return {
            app: store.get_public_app(),
            accounts: store.get_public_accounts(),
        };
    }

    /** 保存百度应用配置 */
    save_baidu_app(data: BaiduAppConfig): void {
        new BaiduTokenStore().save_app(data);
        // 应用配置变了（比如关了自动刷新），驱动要重建
        dispose_all_drivers();
    }

    /**
     * 生成授权链接。
     * @param mode one_click=回调到 FileCat（需在百度控制台登记回调地址）；oob=手动粘贴授权码
     */
    baidu_authorize_url(mode: "one_click" | "oob", callback_url: string): string {
        const store = new BaiduTokenStore();
        return mode === "oob"
            ? store.build_oob_authorize_url()
            : store.build_authorize_url("filecat", callback_url);
    }

    /**
     * 用授权码完成授权。
     * @param redirect_uri 与生成链接时保持一致：一键授权传实际回调 URL，oob 传 "oob"
     */
    async baidu_exchange_code(code: string, redirect_uri?: string): Promise<{uk: number; baidu_name: string}> {
        return new BaiduTokenStore().exchange_code(code, redirect_uri);
    }

    /** 编辑账号（展示名 / 备注 / 是否启用） */
    baidu_update_account(uk: number, data: {name?: string; remark?: string; enabled?: boolean}): void {
        new BaiduTokenStore().update_account(uk, data);
        // 账号名/启用状态可能影响挂载展示与可用性，驱动重建
        this.dispose_by_baidu_account(uk);
    }

    /** 校验单个账号（顺带同步百度侧信息） */
    async baidu_verify(uk: number): Promise<{valid: boolean; error?: string; baidu_name?: string}> {
        return new BaiduTokenStore().verify_account(uk);
    }

    /** 批量校验全部账号，返回每个账号的结果 */
    async baidu_verify_all(): Promise<Array<{uk: number; valid: boolean; error?: string}>> {
        const store = new BaiduTokenStore();
        const accounts = store.get_accounts();
        const out: Array<{uk: number; valid: boolean; error?: string}> = [];
        // 串行执行，避免并发触发百度限流
        for (const a of accounts) {
            const r = await store.verify_account(a.uk);
            out.push({uk: a.uk, valid: r.valid, error: r.error});
        }
        return out;
    }

    /** 取消授权（清空 token，保留账号记录，可重新授权） */
    baidu_deauthorize(uk: number): void {
        new BaiduTokenStore().clear_tokens(uk);
        // 引用了这个账号的挂载驱动要重建
        this.dispose_by_baidu_account(uk);
    }

    /** 删除账号 */
    baidu_delete(uk: number): void {
        new BaiduTokenStore().delete_account(uk);
        this.dispose_by_baidu_account(uk);
    }

    /** 释放引用了某百度账号的挂载驱动 */
    private dispose_by_baidu_account(uk: number): void {
        const target = String(uk);
        for (const m of this.list_raw()) {
            if (m.driver === MountDriverType.baidu && String(m.credential_id) === target) {
                dispose_driver(m.id);
            }
        }
    }
}

/** 挂载服务单例 */
export const mountService = new MountService();
