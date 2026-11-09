import {DataUtil} from "../data/DataUtil";
import {data_common_key} from "../data/data_type";
import {FileMountItem, find_mount, MountMatch, relative_path} from "./mount.pojo";
import {
    CredentialItem,
    CredentialMeta,
    CredentialType,
    CREDENTIAL_META_LIST,
    DRIVER_CREDENTIAL_TYPE,
    get_credential_meta,
    MountAccount,
} from "./credential.pojo";
import {get_driver, dispose_driver, dispose_all_drivers, create_test_driver} from "./driver/driver_factory";
import {FileDriver, MountDriverType} from "./driver/file_driver";
import {clear_tcp_proxy_token} from "./driver/tcp_proxy_driver";
import {FileTypeEnum} from "../../../common/file.pojo";
import {SmbDriver} from "./driver/smb_driver";
import {S3Driver} from "./driver/s3_driver";
import {LocalDriver, LocalSource, validate_local_mount} from "./driver/local_driver";
import {DriverMeta, DRIVER_META_LIST} from "./driver/file_driver_type";
import {
    BaiduTokenStore,
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

    /**
     * 规范化账号列表：没 id 的生成一个（新增的账号）
     */
    normalize_accounts(accounts?: MountAccount[]): MountAccount[] | undefined {
        if (!accounts) {
            return undefined;
        }
        return accounts.map((acc) => {
            const next: MountAccount = {...acc};
            if (!next.id) {
                next.id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            }
            return next;
        });
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

    /** 修改凭据 */
    update_credential(id: string, patch: Partial<CredentialItem>): CredentialItem {
        const list = this.list_credentials();
        const i = list.findIndex(v => v.id === id);
        if (i < 0) {
            throw new Error("凭据不存在");
        }
        const old = list[i];
        list[i] = {
            ...old,
            ...patch,
            id: old.id,
            type: old.type,
        };
        this.set_credentials(list);
        // 凭据改了：引用它的挂载驱动都要重建
        this.dispose_by_credential(id);
        return list[i];
    }

    /** 删除凭据。若仍被挂载引用，拒绝删除（避免挂载突然失效） */
    remove_credential(id: string): void {
        const used = this.list_raw().filter(m => m.credential_id === id);
        if (used.length) {
            const names = used.map(m => m.note || m.mount_path).join("、");
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
    async add(item: Omit<FileMountItem, "id" | "created_at">): Promise<FileMountItem> {
        const list = this.list_raw();
        // 同一个本地目录不允许重复挂载
        const dup = list.find(v => v.mount_path === item.mount_path);
        if (dup) {
            throw new Error(`该目录已被挂载（${dup.note || dup.mount_path}），请先取消原有挂载`);
        }
        const err = this.validate_mount_credential(item.credential_id, item.account_id);
        if (err) {
            throw new Error(err);
        }
        // 本地目录驱动：校验源目录与挂载点，禁止同路径 / 祖孙嵌套（避免无限递归）
        await this.check_local_mount_conflict(item.driver, item.credential_id, item.mount_path, item.root_dir);
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
    async update(id: string, patch: Partial<FileMountItem>): Promise<FileMountItem> {
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
        if (patch.credential_id || patch.account_id || patch.driver) {
            const err = this.validate_mount_credential(
                patch.credential_id ?? list[i].credential_id,
                patch.account_id ?? list[i].account_id,
            );
            if (err) {
                throw new Error(err);
            }
        }
        // 本地目录驱动：任意相关字段变化都要重新做冲突校验
        if (patch.credential_id || patch.mount_path || patch.root_dir || patch.driver) {
            await this.check_local_mount_conflict(
                patch.driver ?? list[i].driver,
                patch.credential_id ?? list[i].credential_id,
                patch.mount_path ?? list[i].mount_path,
                patch.root_dir ?? list[i].root_dir,
                id,
            );
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
     * 凭据缺失或停用时会抛出明确错误，避免难以定位的失败。
     */
    driver_of(mount: FileMountItem): FileDriver {
        const cred = this.get_credential(mount.credential_id);
        if (!cred) {
            throw new Error(`挂载「${mount.note || mount.mount_path}」引用的凭据已不存在，请重新配置`);
        }
        if (cred.enabled === false) {
            throw new Error(`挂载「${mount.note || mount.mount_path}」的凭据已停用`);
        }
        return get_driver(mount, cred);
    }

    /**
     * 校验挂载引用的凭据（及账号）是否存在，返回错误信息；合法返回 undefined
     */
    private validate_mount_credential(credential_id: string, account_id?: string): string | undefined {
        const cred = this.get_credential(credential_id);
        if (!cred) {
            return credential_id ? "所选凭据不存在" : "请选择凭据";
        }
        // 「一凭据多账号」的类型（百度、内网穿透）必须指定账号
        const accounts = cred.accounts ?? [];
        if (cred.type === "baidu") {
            if (!account_id) {
                return "请选择要挂载的账号";
            }
            const acc = accounts.find(v => v.id === account_id);
            if (!acc) {
                return "所选账号不存在";
            }
            if (!acc.token?.access_token) {
                return "所选账号尚未完成授权";
            }
        }
        // 内网穿透必须选一个对端账号，且账号密码齐全（缺密码无法登录对端）
        if (cred.type === "tcp_proxy") {
            if (!account_id) {
                return "请选择要挂载的账号";
            }
            const acc = accounts.find(v => v.id === account_id);
            if (!acc) {
                return "所选账号不存在";
            }
            if (!acc.account_name) {
                return "所选账号缺少对端登录账号";
            }
            if (!acc.password) {
                return "所选账号缺少对端登录密码";
            }
        }
        return undefined;
    }

    /**
     * 本地目录挂载的冲突校验。
     * 仅对 local 驱动生效：取凭据里的源目录，校验它与挂载点的关系。
     * 额外检查：源目录不能落在「其它已存在的挂载点内」，否则会形成挂载链环。
     */
    private async check_local_mount_conflict(
        driver: MountDriverType,
        credential_id: string,
        mount_path: string,
        root_dir?: string,
        exclude_id?: string,
    ): Promise<void> {
        if (driver !== MountDriverType.local) {
            return;
        }
        // 本地目录没有认证信息：root_dir 是凭据里某个映射的名称
        const source_name = String(root_dir ?? "").trim();
        if (!source_name) {
            throw new Error("本地目录挂载请选择源目录");
        }
        const cred = this.get_credential(credential_id);
        const sources: LocalSource[] = cred?.local_sources ?? [];
        const hit = sources.find((s) => String(s?.name ?? "").trim() === source_name);
        if (!hit) {
            throw new Error(`该本地目录凭据里没有映射：${source_name}`);
        }
        const real_source = String(hit.path ?? "").trim();
        if (!real_source) {
            throw new Error(`本地目录映射「${source_name}」缺少路径`);
        }
        const err = await validate_local_mount(real_source, mount_path);
        if (err) {
            throw new Error(err);
        }
        // 源目录不能落在其它挂载点内（避免 A 挂 B、B 又挂 A 的环）
        for (const m of this.list_raw()) {
            if (m.id === exclude_id) {
                continue;
            }
            if (m.enabled === false) {
                continue;
            }
            const rel = relative_path(real_source, m.mount_path);
            if (rel !== null) {
                throw new Error(`源目录位于挂载点「${m.note || m.mount_path}」内，会造成挂载循环`);
            }
        }
    }

    /** 取某个凭据下的账号列表（给前端用） */
    list_accounts(credential_id: string): Array<MountAccount & { authorized: boolean }> {
        const cred = this.get_credential(credential_id);
        if (!cred) {
            return [];
        }
        return (cred.accounts ?? []).map((item) => ({
            ...item,
            authorized: Boolean(item.token?.access_token),
        }));
    }

    /**
     * 新增/修改内网穿透凭据下的对端账号。
     * 有 account_id 表示修改（密码留空 = 不修改），否则新增。
     */
    async save_tcp_proxy_account(req: {
        credential_id: string;
        account_id?: string;
        note?: string;
        account_name: string;
        password?: string;
    }): Promise<MountAccount> {
        const list = this.list_credentials();
        const cred = list.find(v => v.id === req.credential_id);
        if (!cred) {
            throw new Error("凭据不存在");
        }
        if (cred.type !== "tcp_proxy") {
            throw new Error("该凭据不是内网穿透类型");
        }
        const account_name = String(req.account_name ?? "").trim();
        if (!account_name) {
            throw new Error("请填写对端账号");
        }
        const accounts = cred.accounts ?? [];
        const exist = req.account_id ? accounts.find(v => v.id === req.account_id) : undefined;

        let saved: MountAccount;
        if (exist) {
            exist.note = req.note ?? exist.note;
            exist.account_name = account_name;
            exist.password = req.password ?? "";
            saved = exist;
        } else {
            saved = {
                id: `tcp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                note: req.note ?? "",
                account_name,
                password: req.password ?? "",
                enabled: true,
            };
            accounts.push(saved);
            cred.accounts = accounts;
        }
        this.set_credentials(list);
        // 账号信息变了，旧登录缓存作废
        clear_tcp_proxy_token(cred.tcp_client_num_id);
        return saved;
    }

    /** 删除内网穿透凭据下的对端账号；被挂载引用时拒绝 */
    async remove_tcp_proxy_account(credential_id: string, account_id: string): Promise<void> {
        const list = this.list_credentials();
        const cred = list.find(v => v.id === credential_id);
        if (!cred) {
            throw new Error("凭据不存在");
        }
        const used = this.list_raw().find(v => v.credential_id === credential_id && v.account_id === account_id);
        if (used) {
            throw new Error(`该账号正在被挂载「${used.note || used.mount_path}」使用，无法删除`);
        }
        cred.accounts = (cred.accounts ?? []).filter(v => v.id !== account_id);
        this.set_credentials(list);
        // 账号被删，旧登录缓存作废
        clear_tcp_proxy_token(cred.tcp_client_num_id);
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
        account_id?: string;
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
                    account_id: req.account_id ?? old.account_id,
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
                    account_id: req.account_id,
                    root_dir: req.root_dir,
                };
            }
            const cred = this.get_credential(mount.credential_id);
            if (!cred) {
                return {ok: false, error: "请选择凭据"};
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
     * 列出远端可选的位置：
     *  · SMB   —— 共享名
     *  · S3    —— 存储桶
     *  · 其它  —— 指定目录下的子目录（用于逐步选起始目录）
     *
     * 连接信息和账号都从凭据里取，按 account_id 选中其中一个账号。
     */
    async list_shares(driver: MountDriverType, credential_id: string, path?: string,
                      account_id?: string): Promise<{name: string; remark: string}[]> {
        const cred = this.get_credential(credential_id);
        if (!cred) {
            throw new Error("凭据不存在");
        }
        const account = (cred.accounts ?? []).find(v => v.id === account_id);
        // 传了 path 说明已经选好共享/桶，接下来是挑里面的子目录，走下面共用的列举逻辑
        if (!path && driver === MountDriverType.smb) {
            return SmbDriver.list_shares({
                server: cred.smb_server,
                username: account?.account_name,
                password: account?.password,
            });
        }
        if (!path && driver === MountDriverType.s3) {
            return S3Driver.list_buckets({
                endpoint: cred.s3_endpoint,
                region: cred.s3_region,
                access_key: account?.account_name,
                secret_key: account?.secret_key,
                force_path_style: cred.s3_force_path_style === true,
            });
        }

        // 其余协议：把远端目录下的子目录列出来，供逐层挑选起始目录
        const mount: FileMountItem = {
            id: "list_shares",
            driver,
            // SMB 的共享名 / S3 的桶名也是位置的一部分，要一起给驱动，否则列不到
            root_dir: path && path.trim() ? path.trim() : "",
            account_id,
            credential_id,
            mount_path: "",
        };
        const d = create_test_driver(mount, cred);
        try {
            const items = await d.list("/");
            return items
                .filter((it) => it.type === FileTypeEnum.folder)
                .map((it) => ({
                    name: it.name,
                    remark: "",
                }));
        } finally {
            try {
                (d as any).dispose?.();
            } catch (e) {
                // ignore
            }
        }
    }

    /**
     * 测试凭据：用一份「尚未保存」的凭据试连一次。
     * 凭据本身不含挂载信息，所以需要一个驱动类型才能试（默认用对应类型 + 根目录）。
     * account_id 指定用凭据里的哪个账号，多账号类型（内网穿透、SMB 等）必须传。
     */
    async test_credential(req: {
        type?: CredentialType;
        credential?: Partial<CredentialItem>;
        driver?: MountDriverType;
        account_id?: string;
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
            const mount: FileMountItem = {
                id: "test_credential",
                driver: driver_type,
                mount_path: "",
                credential_id: "",
                root_dir: "",
                account_id: req.account_id,
            };
            const cred: CredentialItem = {
                ...(req.credential ?? {}),
                id: "test_credential",
                type,
                note: "test",
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
    // ==================== 百度网盘授权 ====================

    /**
     * 生成授权链接。
     * @param id 百度凭据 id（= 应用）
     * @param mode one_click=回调到 FileCat（需在百度控制台登记回调地址）；oob=手动粘贴授权码
     */
    baidu_authorize_url(id: string, mode: "one_click" | "oob", callback_url: string): string {
        const store = new BaiduTokenStore(id);
        // state 带回凭据 id，回调时用它定位是哪个应用在授权
        return mode === "oob"
            ? store.build_oob_authorize_url()
            : store.build_authorize_url(id, callback_url);
    }

    /**
     * 用授权码完成授权（授权成功后账号自动加入该应用的 accounts）。
     * @param id 百度凭据 id（= 应用）
     * @param redirect_uri 与生成链接时保持一致：一键授权传实际回调 URL，oob 传 "oob"
     */
    async baidu_exchange_code(id: string, code: string, redirect_uri: string): Promise<{uk: string; baidu_name: string}> {
        const store = new BaiduTokenStore(id);
        const r = await store.exchange_code(code, redirect_uri);
        this.dispose_by_credential(id);
        return r;
    }

    /**
     * 校验某个百度账号（顺带同步百度侧信息）。
     * @param account_id 账号 id（= 百度 uk）
     */
    async baidu_verify(id: string, account_id: string): Promise<{valid: boolean; error?: string; account_name?: string}> {
        return new BaiduTokenStore(id, account_id).verify();
    }

    /** 批量校验全部百度账号（每个应用的每个账号） */
    async baidu_verify_all(): Promise<Array<{id: string; account_id: string; valid: boolean; error?: string}>> {
        const out: Array<{id: string; account_id: string; valid: boolean; error?: string}> = [];
        // 串行执行，避免并发触发百度限流
        for (const cred of this.list_credentials().filter(v => v.type === "baidu")) {
            for (const acc of cred.accounts ?? []) {
                const r = await new BaiduTokenStore(cred.id, acc.id).verify();
                out.push({id: cred.id, account_id: acc.id, valid: r.valid, error: r.error});
            }
        }
        return out;
    }

    /** 删除某个已授权账号（保留应用配置与凭据本体） */
    baidu_deauthorize(id: string, account_id: string): void {
        new BaiduTokenStore(id).remove_account(account_id);
        this.dispose_by_credential(id);
    }
}


/** 挂载服务单例 */
export const mountService = new MountService();
