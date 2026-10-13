/**
 * 网页代理（WebVPN）端口模式服务。
 *
 * 核心思路：每个代理目标占用一个【独立端口】，该端口上请求的路径就是干净的真实路径。
 *   · SPA 读 location.pathname 天然正确（不会像路径模式那样匹配不到路由）
 *   · Origin 天然按端口隔离（localStorage / Cookie 互不可见，互不覆盖）
 *   · 同目标资源路径天然正确，无需复杂改写
 *
 * 鉴权：端口上的 server 复用 FileCat 的登录 token。
 *   首次访问带 ?_t=<token>，校验通过后种 cookie，其后请求凭 cookie。
 *
 * 安全：复用目标地址访问策略（browser_proxy_policy），默认禁止环回/内网/受限地址。
 */
import http from 'http';
import net from 'net';
import {URL} from 'url';
import {IncomingMessage, ServerResponse} from 'http';
import {Request, Response} from 'express';
import {DataUtil} from '../data/DataUtil';
import {data_common_key} from '../data/data_type';
import {userService} from '../user/user.service';
import {UserAuth} from '../../../common/req/user.req';
import {settingService} from '../setting/setting.service';
import {check_target_allowed} from '../../other/middleware/browser_proxy_policy';
import {handle_browser_proxy_port_request, ProxyTargetRoute} from '../../other/middleware/BrowserProxy';

/** 一条端口映射记录 */
export interface BrowserProxyPortItem {
    id: string;          // 唯一 id
    proto: string;       // 上游协议 http / https
    host: string;        // 上游主机（可能是域名或 IP:端口）
    root_path: string;   // 上游根路径（一般 /）
    port: number;        // 本地分配端口
    note?: string;       // 备注
    enabled?: boolean;   // 是否启用（禁用后不监听端口）
    created_at: number;
}

/** 每个端口对应的 server 实例 */
interface PortServerEntry {
    server: http.Server;
    sockets: Set<net.Socket>;
}

/** token cookie 名 */
const TOKEN_COOKIE = 'filecat_bp_token';

export class BrowserProxyPortService {
    private servers: Map<number, PortServerEntry> = new Map();

    /**
     * 解析用户输入的目标地址，得到 proto / host / root_path。
     * 未写协议时默认 http；允许带路径（作为上游根路径）。
     * 例：
     *   "https://example.com/app"  -> { proto:'https', host:'example.com', root_path:'/app' }
     *   "192.168.1.1:8080"         -> { proto:'http',  host:'192.168.1.1:8080', root_path:'/' }
     */
    static parse_address(address: string): { proto: string; host: string; root_path: string } {
        let input = String(address || '').trim();
        if (!input) {
            throw new Error('目标地址不能为空');
        }
        let proto = 'http';
        const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(input);
        if (m) {
            proto = m[1].toLowerCase() === 'https' ? 'https' : 'http';
            input = input.slice(m[0].length);
        }
        // 拆出路径部分
        const slash = input.indexOf('/');
        let host = slash === -1 ? input : input.slice(0, slash);
        let root_path = slash === -1 ? '/' : input.slice(slash);
        host = host.trim();
        if (!host) {
            throw new Error('目标主机不能为空');
        }
        if (!root_path) {
            root_path = '/';
        }
        return {proto, host, root_path};
    }

    // ==================== 持久化 ====================

    /** 读取所有端口映射 */
    list(): BrowserProxyPortItem[] {
        const raw = DataUtil.get(data_common_key.browser_proxy_port_list);
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw as BrowserProxyPortItem[];
    }

    private save(items: BrowserProxyPortItem[]) {
        DataUtil.set(data_common_key.browser_proxy_port_list, items);
    }

    get_by_port(port: number): BrowserProxyPortItem | undefined {
        return this.list().find(i => i.port === port);
    }

    // ==================== 端口分配 ====================

    /** 从系统设置里取端口范围 */
    private get_port_range(): { start: number; end: number } {
        const env = settingService.get_sys_env();
        let start = Number(env.browser_proxy_port_start) || 5610;
        let end = Number(env.browser_proxy_port_end) || 5710;
        start = Math.max(1, Math.min(65535, start));
        end = Math.max(start, Math.min(65535, end));
        return {start, end};
    }

    /** 检测端口是否被占用（系统层面） */
    private is_port_free(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const tester = net.createServer();
            tester.once('error', () => resolve(false));
            tester.once('listening', () => {
                tester.close(() => resolve(true));
            });
            tester.listen(port, '0.0.0.0');
        });
    }

    /** 在端口范围内找一个空闲端口（排除已分配的和系统占用的） */
    async alloc_port(): Promise<number> {
        const {start, end} = this.get_port_range();
        const used = new Set(this.list().map(i => i.port));
        for (let p = start; p <= end; p++) {
            if (used.has(p)) {
                continue;
            }
            if (await this.is_port_free(p)) {
                return p;
            }
        }
        throw new Error(`网页代理端口范围 ${start}-${end} 已无可用端口`);
    }

    // ==================== 增删目标 ====================

    /** 添加一个代理目标，并启动对应端口服务 */
    async add(target: { address: string; note?: string }): Promise<BrowserProxyPortItem> {
        const {proto, host, root_path} = BrowserProxyPortService.parse_address(target.address);
        // 目标策略校验（加的时候就拦一遍，避免加了不能用）
        const check = await check_target_allowed(host, {allow_list: this.get_allow_list()});
        if (!check.allowed) {
            throw new Error(`目标地址不允许访问：${check.reason ?? 'denied'}`);
        }
        // 同一目标已存在则直接返回（避免重复分配端口）
        const exist = this.list().find(i => i.proto === proto && i.host === host);
        if (exist) {
            return exist;
        }
        const port = await this.alloc_port();
        const item: BrowserProxyPortItem = {
            id: this.gen_id(),
            proto,
            host,
            root_path,
            port,
            note: target.note || '',
            enabled: true, // 默认启用
            created_at: Date.now(),
        };
        const items = this.list();
        items.push(item);
        this.save(items);
        this.start_port_server(item);
        return item;
    }

    /** 删除一个代理目标，并关闭对应端口服务 */
    remove(id: string): boolean {
        const items = this.list();
        const idx = items.findIndex(i => i.id === id);
        if (idx === -1) {
            return false;
        }
        const [removed] = items.splice(idx, 1);
        this.save(items);
        this.stop_port_server(removed.port);
        return true;
    }

    /** 更新一个代理目标（address/note）；当上游地址变化时需要重建端口服务 */
    async update(id: string, patch: { address?: string; note?: string }): Promise<BrowserProxyPortItem | null> {
        const items = this.list();
        const it = items.find(i => i.id === id);
        if (!it) {
            return null;
        }
        let changed_upstream = false;
        if (patch.address !== undefined) {
            const {proto, host, root_path} = BrowserProxyPortService.parse_address(patch.address);
            changed_upstream = proto !== it.proto || host !== it.host || root_path !== it.root_path;
            // 上游地址发生变化时，先校验新目标是否允许访问，避免改了之后不可用
            if (changed_upstream) {
                const check = await check_target_allowed(host, {allow_list: this.get_allow_list()});
                if (!check.allowed) {
                    throw new Error(`目标地址不允许访问：${check.reason ?? 'denied'}`);
                }
            }
            it.proto = proto;
            it.host = host;
            it.root_path = root_path;
        }
        if (patch.note !== undefined) {
            it.note = patch.note || '';
        }
        this.save(items);
        // 上游地址变了，端口服务需要按新目标重启（仅在启用状态下）
        if (changed_upstream && it.enabled !== false) {
            this.start_port_server(it);
        }
        return it;
    }

    // ==================== 端口服务生命周期 ====================

    /** 启动所有已保存映射的端口服务（进程启动时调用） */
    start_all() {
        for (const item of this.list()) {
            if (item.enabled === false) {
                continue; // 禁用状态不监听端口
            }
            this.start_port_server(item);
        }
    }

    /** 设置启用状态：启用则监听端口，禁用则关闭端口服务 */
    async set_enabled(id: string, enabled: boolean): Promise<BrowserProxyPortItem | null> {
        const items = this.list();
        const it = items.find(i => i.id === id);
        if (!it) {
            return null;
        }
        it.enabled = !!enabled;
        this.save(items);
        if (it.enabled) {
            this.start_port_server(it);
        } else {
            if (this.servers.has(it.port)) {
                this.stop_port_server(it.port);
            } else {
                console.log(`[BrowserProxyPort] 网页代理目标已禁用: ${it.proto}://${it.host}（端口 ${it.port} 未在监听）`);
            }
        }
        return it;
    }

    /** 关闭所有端口服务 */
    stop_all() {
        for (const port of Array.from(this.servers.keys())) {
            this.stop_port_server(port);
        }
    }

    private start_port_server(item: BrowserProxyPortItem) {
        const port = item.port;
        if (!port || port <= 0) {
            return;
        }
        if (this.servers.has(port)) {
            this.stop_port_server(port);
        }
        const sockets: Set<net.Socket> = new Set();
        const server = http.createServer((req, res) => {
            this.handle_request(item, req, res);
        });
        server.on('connection', (socket: net.Socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
        });
        server.on('error', (e: any) => {
            console.error(`[BrowserProxyPort] 端口 ${port} 服务错误:`, e?.message);
        });
        server.listen(port, '0.0.0.0', () => {
            console.log(`[BrowserProxyPort] 网页代理端口已启动: ${port} -> ${item.proto}://${item.host}`);
        });
        this.servers.set(port, {server, sockets});
    }

    private stop_port_server(port: number) {
        const entry = this.servers.get(port);
        if (!entry) {
            return;
        }
        this.servers.delete(port);
        // 统计并断开尚未关闭的连接
        let closed_conn = 0;
        for (const s of entry.sockets) {
            if (!s.destroyed) {
                s.destroy();
                closed_conn++;
            }
        }
        entry.sockets.clear();
        entry.server.close(() => {
            console.log(`[BrowserProxyPort] 网页代理端口已关闭: ${port}（断开连接 ${closed_conn} 个）`);
        });
        entry.server.closeAllConnections?.();
        entry.server.closeIdleConnections?.();
    }

    // ==================== 请求处理 ====================

    private get_allow_list(): string[] {
        try {
            const list = settingService.get_sys_env()?.browser_proxy_allow;
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    /** 把已启用目标转成跨目标路由列表（供端口改写时匹配「其它已配置目标」） */
    private get_target_routes(): ProxyTargetRoute[] {
        const routes: ProxyTargetRoute[] = [];
        for (const it of this.list()) {
            // 禁用目标不监听端口，不应被改写指向（否则点过去打不开）
            if (it.enabled === false) {
                continue;
            }
            routes.push({
                host: String(it.host || '').toLowerCase(),
                port: it.port,
                proto: it.proto,
            });
        }
        return routes;
    }

    /** 端口 server 的请求入口 */
    private async handle_request(item: BrowserProxyPortItem, req: IncomingMessage, res: ServerResponse) {
        const raw_url = req.url || '/';
        const q_index = raw_url.indexOf('?');
        const query = q_index === -1 ? '' : raw_url.slice(q_index + 1);
        const path = q_index === -1 ? raw_url : raw_url.slice(0, q_index);

        // ---------- 鉴权 ----------
        const params = new URLSearchParams(query);
        const query_token = params.get('_t') || '';
        const cookie_token = this.get_cookie_token(req);

        let allowed = false;
        if (query_token) {
            allowed = this.check_token(query_token);
        }
        if (!allowed && cookie_token) {
            allowed = this.check_token(cookie_token);
        }
        // 带 query token 首次访问：校验通过后种 cookie 并重定向去掉 _t
        if (query_token && allowed) {
            params.delete('_t');
            const qs = params.toString();
            const clean_url = path + (qs ? `?${qs}` : '');
            res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${encodeURIComponent(query_token)}; Path=/; HttpOnly; SameSite=Lax`);
            res.statusCode = 302;
            res.setHeader('Location', clean_url);
            res.end();
            return;
        }
        if (!allowed) {
            res.statusCode = 403;
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end('<h1>403</h1><p>网页代理：无权限或未登录（请从 FileCat 网页代理入口进入）</p>');
            return;
        }

        // ---------- 目标地址策略 ----------
        const check = await check_target_allowed(item.host, {allow_list: this.get_allow_list()});
        if (!check.allowed) {
            res.statusCode = 403;
            res.end(`网页代理：目标地址不允许访问（${check.reason ?? 'denied'}）`);
            return;
        }

        // ---------- 构造上游 URL 并转发 ----------
        let target_url: URL;
        try {
            target_url = new URL(`${item.proto}://${item.host}${path}${query ? `?${query}` : ''}`);
        } catch {
            res.statusCode = 400;
            res.end('网页代理：非法的目标地址');
            return;
        }

        // 端口模式下的页面绝对地址：浏览器访问的真实地址（用于相对 URL 解析）
        const host_header = String(req.headers.host || `localhost:${item.port}`);
        const page_url = new URL(`http://${host_header}${raw_url}`);

        // 跨目标路由：把页面里指向「其它已配置目标」的地址改写到对应端口
        const cross_routes = this.get_target_routes();

        // 转成 express 风格对象，复用 handle_browser_proxy_port_request
        (req as any).__page_url = page_url;
        (req as any).__port = item.port;
        handle_browser_proxy_port_request(req as unknown as Request, res as unknown as Response, target_url, item.host, cross_routes);
    }

    /** 从请求的 Cookie 头里取出 token */
    private get_cookie_token(req: IncomingMessage): string {
        const cookie = req.headers.cookie || '';
        const m = new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE}=([^;]*)`).exec(cookie);
        if (!m) {
            return '';
        }
        try {
            return decodeURIComponent(m[1]);
        } catch {
            return m[1];
        }
    }

    /** 校验 token 是否有 browser_proxy 权限 */
    private check_token(token: string): boolean {
        if (!token) {
            return false;
        }
        try {
            return userService.have_user_auth(token, UserAuth.browser_proxy, false);
        } catch {
            return false;
        }
    }

    private gen_id(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
}

export const browserProxyPortService = new BrowserProxyPortService();
