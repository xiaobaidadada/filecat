/**
 * 网页代理（WebVPN）端口模式：共用工具 + 注入脚本 + 请求/升级处理。
 *
 * 端口模式的核心思路：每个代理目标占用一个【独立端口】，该端口上请求的路径
 * 就是干净的真实路径。
 *   · SPA 读 location.pathname 天然正确
 *   · Origin 天然按端口隔离（localStorage / Cookie 互不可见）
 *   · 同目标资源路径天然正确，仅需把「绝对形式的同 host URL」收敛为相对路径
 *
 * 本模块提供三类能力：
 *   1. HTTP 转发：handle_browser_proxy_port_request
 *   2. WebSocket 转发：handle_browser_proxy_port_upgrade（裸 TCP/TLS 隧道，直连上游）
 *   3. 共用工具：HTML 改写、脚本注入、Cookie/Referer 处理等
 *
 * 其他取舍：
 *   · 请求时强制 Accept-Encoding: identity，逼目标站返回明文，省去解压再压缩
 *   · 用 iconv-lite 按 charset 解码，兼容 GBK 等中文站点
 */
import http from 'http';
import https from 'https';
import tls from 'tls';
import net from 'net';
import iconv from 'iconv-lite';
import zlib from 'zlib';
import {URL} from 'url';
import {IncomingMessage} from 'http';
import {HttpsProxyAgent} from 'https-proxy-agent';
import {HttpRequest} from '../../../common/node/http';
import {Request, Response} from 'express';

const REQUEST_TIMEOUT = 30000;

const INJECT_ID = '__filecat_webvpn_script__';

/** 脚本执行标记（挂在 window 上，避免重复注入时重复 hook） */
const INJECT_FLAG = '__filecat_webvpn__';

/** 不向上游转发的请求头（影响响应形态或会造成回环） */
export const STRIP_REQ_HEADERS = new Set([
    'host', 'connection', 'keep-alive', 'proxy-connection',

    'transfer-encoding',
    'upgrade', 'accept-encoding', 'referer', 'origin',
]);

/** 不向浏览器回传的响应头（安全策略类会拦住 iframe，编码/长度类由我们自己控制） */
export const STRIP_RES_HEADERS = new Set([
    'content-security-policy', 'content-security-policy-report-only',
    'x-frame-options', 'content-encoding', 'content-length',
    'strict-transport-security', 'clear-site-data',
    'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy',
    'transfer-encoding', 'connection', 'keep-alive', 'trailer', 'upgrade',
]);


const MULTI_SUFFIX = new Set([
    'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk',
    'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
    'com.hk', 'org.hk', 'edu.hk', 'gov.hk', 'com.tw', 'org.tw', 'edu.tw',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
    'com.br', 'com.mx', 'com.ar', 'co.jp', 'co.kr', 'co.in', 'co.nz', 'co.za',
    'com.sg', 'com.my', 'com.tr', 'com.vn', 'com.sa', 'com.eg', 'com.ua',
]);

/**
 * 取域名对应的「可注册主域」(eTLD+1)。
 * 例如 www.a.co.uk → a.co.uk，a.example.com → example.com。
 */
export function get_registrable_domain(host: string): string {
    const h = host.toLowerCase().replace(/\.$/, '');
    const parts = h.split('.');
    if (parts.length <= 2) {
        return h;
    }
    const last2 = parts.slice(-2).join('.');
    // 末两段是公共后缀时，主域需要再往前取一段
    if (MULTI_SUFFIX.has(last2) && parts.length >= 3) {
        return parts.slice(-3).join('.');
    }
    return last2;
}

export function is_same_site_host(a: string, b: string): boolean {
    const norm = (h: string) => h.replace(/^www\./, '').toLowerCase();
    const ha = norm(a);
    const hb = norm(b);
    if (ha === hb) {
        return true;
    }
    return get_registrable_domain(ha) === get_registrable_domain(hb);
}


export function decode_body(buf: Buffer, encoding: string): Buffer {
    if (!buf.length) {
        return buf;
    }
    if (encoding === 'gzip' || encoding === 'x-gzip') {
        return zlib.gunzipSync(buf);
    }
    if (encoding === 'deflate') {
        return zlib.inflateSync(buf);
    }
    if (encoding === 'br') {
        return zlib.brotliDecompressSync(buf);
    }
    return buf;
}

/** MIME 是否为 HTML */
export function is_html(content_type: string): boolean {
    return /text\/html|application\/xhtml\+xml/i.test(content_type);
}

export function is_document_request(req: Request): boolean {
    const dest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
    if (dest) {
        return dest === 'document' || dest === 'iframe';
    }
    // 老浏览器/非浏览器客户端不带该头：只有 GET 且没有 X-Requested-With
    // 这类明显 ajax 标记时，才按导航请求对待。
    if (req.method !== 'GET') {
        return false;
    }
    return !req.headers['x-requested-with'];
}


export function inject_script_before_first_script(html: string, inject: string): string {
    // 只认真正的 script 开标签：前一个字符不能是字母（排除 <noscript> 之类误匹配），
    // 同时跳过 HTML 注释里的 <script>（注释里插脚本会破坏注释结构）
    const re = /<!--[\s\S]*?-->|<script[\s>]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        if (m[0][0] !== '<' || m[0][1] === '!') {
            continue;               // 注释块，跳过
        }
        return html.slice(0, m.index) + inject + html.slice(m.index);
    }
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head[^>]*>/i, (t) => t + inject);
    }
    return inject + html;
}

/** 从 Content-Type 取 charset，取不到默认 utf-8 */
export function get_charset(content_type: string): string {
    const m = /charset\s*=\s*"?([\w-]+)"?/i.exec(content_type);
    if (!m) {
        return 'utf-8';
    }
    const cs = m[1].toLowerCase();
    return cs === 'utf8' ? 'utf-8' : cs;
}


// ============================================================================
// 端口模式（WebVPN 每目标一个独立端口）
//
// 与路径模式的区别：同一个端口只对应一个目标，路径就是「干净的真实路径」。
// 因此：
//   · SPA 读 location.pathname 天然正确（不会匹配不到路由）
//   · Origin 天然按端口隔离（localStorage / Cookie 互不可见）
//   · 同 host 地址天然正确，无需改写；仅需把「绝对形式的同 host URL」收敛为相对路径
//   · 页面里指向「其它已配置目标」的地址 → 改写到对应目标的端口，留在代理体系内
//   · 未配置成目标的地址（含同主域子域）→ 保持原样（浏览器直连，不做任何处理）
// ============================================================================

/**
 * 跨目标路由：把页面里指向「其它已配置目标」的地址，改写成该目标所在端口的代理地址。
 * 这样知网页面里指向百度（若已配置）的链接就会继续留在 FileCat 代理体系内。
 */
export interface ProxyTargetRoute {
    /** 该目标精确匹配的 host（小写，可能含端口） */
    host: string;
    /** 该目标对外提供服务的本地端口 */
    port: number;
    /** 该目标的上游协议（http / https）—— 用于还原 Referer/Origin 时构造真实上游地址 */
    proto?: string;
}

/** 跨目标匹配结果：命中的目标端口 */
export interface CrossTargetHit {
    port: number;
}

/** 去掉 host 里的端口，得到纯主机名 */
function host_without_port(host: string): string {
    const h = String(host || '').toLowerCase();
    const i = h.indexOf(':');
    return i === -1 ? h : h.slice(0, i);
}

/**
 * 构建跨目标匹配器。
 *
 * 规则（简化后）：
 *   · 页面上出现的地址，只要它的 host **被配置成某个代理目标**，就改写到该目标的端口；
 *   · 每个目标天然可匹配到「除自己以外」的全部目标 host（相当于自动的 extra_hosts）；
 *   · 协议不参与匹配（忽略 http/https 差异）；
 *   · 多个目标同时命中同一 host 视为歧义，返回 null（不随意选一个）。
 *
 * @param routes      全部已配置目标
 * @param target_host 当前页面所属 host（自身不作为跨目标）
 */
export function build_cross_target_matcher(routes: ProxyTargetRoute[], target_host: string): (host: string) => CrossTargetHit | null {
    const cur_host = host_without_port(target_host);
    // host -> 命中集合（用 JSON 串做去重/歧义判断）
    const exact = new Map<string, Set<string>>();

    for (const r of routes) {
        if (!r || !r.host || !r.port) {
            continue;
        }
        const key = r.host.toLowerCase();
        let set = exact.get(key);
        if (!set) {
            set = new Set();
            exact.set(key, set);
        }
        set.add(JSON.stringify({port: r.port} as CrossTargetHit));
    }

    /** 从候选集合里选唯一结果；多个候选视为歧义返回 null */
    const pick = (set: Set<string> | undefined): CrossTargetHit | null => {
        if (!set || set.size === 0) {
            return null;
        }
        if (set.size > 1) {
            return null; // 歧义：不随意选一个
        }
        return JSON.parse(Array.from(set)[0]) as CrossTargetHit;
    };

    return (host: string): CrossTargetHit | null => {
        if (!host) {
            return null;
        }
        const h = String(host).toLowerCase();
        // 当前目标自身不作为跨目标
        if (host_without_port(h) === cur_host) {
            return null;
        }
        return pick(exact.get(h));
    };
}


/**
 * 把绝对地址改写成「某另一个已配置目标端口」的代理地址。
 * 用当前访问 FileCat 的主机名，端口用目标端口，保留原 path/search/hash。
 */
export function cross_target_url(abs: URL, hit: CrossTargetHit, filecat_hostname: string): string {
    const hostname = host_without_port(filecat_hostname) || 'localhost';
    return `http://${hostname}:${hit.port}${abs.pathname}${abs.search}${abs.hash}`;
}

/** 端口模式下，把同目标绝对地址收敛为代理可识别的形式；跨域/特殊协议保持原样 */
export function port_wrap_url(raw: string, page_url: URL, target_host: string): string {
    if (raw == null) {
        return raw;
    }
    const u = String(raw);
    if (!u) {
        return u;
    }
    if (/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(u)) {
        return u;
    }
    let abs: URL;
    try {
        abs = new URL(u, page_url);
    } catch {
        return u;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') {
        return u;
    }
    // 同 host → 收敛为相对路径（去掉 host，靠当前端口回源）
    if (abs.host === target_host) {
        return abs.pathname + abs.search + abs.hash;
    }
    // 其它地址（含同主域子域、跨域）→ 保持原样，不做任何处理
    return u;
}

/** 端口模式：重写 HTML 里指向同目标/跨目标的绝对地址 */
function port_rewrite_html(html: string, page_url: URL, real_url: URL, target_host: string, ctx: PortRewriteCtx): string {
    const tag_re = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;

    return html.replace(tag_re, (whole, tag_name, attrs) => {
        const new_attrs = attrs.replace(ATTR_RE, (m, name, eq, _all, dq, sq, uq) => {
            const lname = String(name).toLowerCase();
            if (!PORT_URL_ATTRS.has(lname)) {
                return m;
            }
            const raw = dq !== undefined ? dq : (sq !== undefined ? sq : uq);
            if (raw == null || raw === '') {
                return m;
            }
            const wrapped = port_rewrite_value(raw, page_url, real_url, target_host, ctx);
            if (wrapped === null) {
                return m;
            }
            const quote = dq !== undefined ? '"' : (sq !== undefined ? "'" : '');
            return `${name}${eq}${quote}${wrapped}${quote}`;
        });
        return `<${tag_name}${new_attrs}>`;
    });
}

/** 端口模式：单个属性值改写；无需改写返回 null */
function port_rewrite_value(raw: string, page_url: URL, real_url: URL, target_host: string, ctx: PortRewriteCtx): string | null {
    if (/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(raw)) {
        return null;
    }
    // srcset 候选列表
    if (/,/.test(raw) && !/^https?:\/\//i.test(raw)) {
        let changed = false;
        const rebuilt = raw.split(',').map(seg => {
            const s = seg.trim();
            if (!s) {
                return seg;
            }
            const sp = s.split(/\s+/);
            const one = port_rewrite_single(sp[0], page_url, real_url, target_host, ctx);
            if (one === null) {
                return seg;
            }
            changed = true;
            return ` ${[one, ...sp.slice(1)].join(' ')}`;
        }).join(',');
        return changed ? rebuilt.replace(/^ /, '') : null;
    }
    return port_rewrite_single(raw, page_url, real_url, target_host, ctx);
}

/** 端口模式改写的上下文：跨目标匹配 + 当前 FileCat 主机（用于拼跨目标端口地址） */
interface PortRewriteCtx {
    match_cross: (host: string) => CrossTargetHit | null;
    filecat_hostname: string;
    /** 所有已配置目标的端口集合（用于识别「已是代理端口地址」避免二次改写） */
    target_ports: Set<number>;
    /** 全部已配置目标（供注入脚本内置跨目标匹配表） */
    routes: ProxyTargetRoute[];
}

function port_rewrite_single(raw: string, page_url: URL, real_url: URL, target_host: string, ctx: PortRewriteCtx): string | null {
    if (raw.startsWith('#')) {
        return null;
    }

    const is_abs = /^https?:\/\//i.test(raw) || raw.startsWith('//');
    const candidate = raw.startsWith('//') ? `${page_url.protocol}${raw}` : raw;
    let abs: URL;
    try {
        abs = new URL(candidate, page_url);
    } catch {
        return null;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') {
        return null;
    }
    // 已是跨目标端口地址（指向本机某端口）→ 不再改写
    if (abs.hostname === host_of(ctx.filecat_hostname) || abs.hostname === 'localhost' || abs.hostname === '127.0.0.1') {
        const port_hit = cross_target_own_port(abs, ctx);
        if (port_hit) {
            return null;
        }
    }
    // 1) 跨目标优先：指向另一个已配置目标 → 改写成该目标端口地址
    if (is_abs) {
        const hit = ctx.match_cross(abs.host);
        if (hit) {
            return cross_target_url(abs, hit, ctx.filecat_hostname);
        }
    }
    // 2) 同站逻辑
    if (!is_same_site_host(abs.host, target_host)) {
        return null;
    }
    // 本来就是相对路径 → 不改
    if (!is_abs) {
        return null;
    }
    // 仅同 host 收敛为相对路径；其它（含同主域子域）不改写
    if (abs.host !== target_host) {
        return null;
    }
    return abs.pathname + abs.search + abs.hash;
}

/** 从「host:port」取纯主机名 */
function host_of(host_port: string): string {
    const h = String(host_port || '');
    const i = h.indexOf(':');
    return i === -1 ? h : h.slice(0, i);
}

/** 判断地址是否已指向「当前 FileCat 主机的某个已配置目标端口」（避免重复改写） */
function cross_target_own_port(abs: URL, ctx: PortRewriteCtx): boolean {
    const port = Number(abs.port);
    if (!port) {
        return false;
    }
    return ctx.target_ports.has(port);
}

/** 端口模式需要改写的 URL 属性白名单 */
const PORT_URL_ATTRS = new Set([
    'src', 'href', 'action', 'poster', 'formaction', 'data-src', 'cite', 'background', 'srcset',
]);

/** 端口模式的注入脚本：处理运行时动态拼出的跨目标/同目标绝对 URL */
function build_port_inject_script(page_url: URL, real_url: URL, target_host: string, ctx: PortRewriteCtx): string {
    // 跨目标路由数据：每条为 [host, port]，凡是页面里出现该 host 的地址就改写到其端口
    const exact_pairs: (string | number)[][] = [];
    (ctx.routes || []).forEach((r: ProxyTargetRoute) => {
        exact_pairs.push([r.host.toLowerCase(), r.port]);
    });
    return `<script id="${INJECT_ID}">
(function(){
  if (window.${INJECT_FLAG}) return;
  window.${INJECT_FLAG} = true;
  var REAL_PAGE = ${JSON.stringify(real_url.href)};
  var TARGET_HOST = ${JSON.stringify(target_host)};
  var FILECAT_HOST = ${JSON.stringify(host_of(ctx.filecat_hostname) || 'localhost')};
  var CROSS_EXACT = ${JSON.stringify(exact_pairs)};

  function clean_host(h) {
    return String(h).replace(/^www\\./, '').toLowerCase();
  }
  function is_target_host(host) {
    return clean_host(host) === clean_host(TARGET_HOST);
  }

  // 跨目标匹配：返回 {port} 或 null（多个候选视为歧义不选）
  function match_cross(host) {
    var h = String(host || '').toLowerCase();
    var bare = h.indexOf(':') === -1 ? h : h.slice(0, h.indexOf(':'));
    if (bare === TARGET_HOST.toLowerCase()) return null;
    var hit = null, multi = false, i;
    for (i = 0; i < CROSS_EXACT.length; i++) {
      if (CROSS_EXACT[i][0] === h) {
        if (hit !== null && hit.port !== CROSS_EXACT[i][1]) { multi = true; break; }
        hit = {port: CROSS_EXACT[i][1]};
      }
    }
    if (multi) return null;
    return hit;
  }

  function wrap(u) {
    if (u == null) return u;
    u = String(u);
    if (!u) return u;
    if (/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(u)) return u;
    var abs;
    // 用「真实上游页面地址」作基准解析相对路径
    try { abs = new URL(u, REAL_PAGE); } catch(e) { return u; }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return u;
    var is_abs = /^https?:\\/\\//i.test(u) || u.indexOf('//') === 0;
    // 跨目标优先：页面里出现的地址若属于某个已配置目标 → 改写到该目标端口
    if (is_abs) {
      var hit = match_cross(abs.host);
      if (hit) {
        return 'http://' + FILECAT_HOST + ':' + hit.port + abs.pathname + abs.search + abs.hash;
      }
    }
    // 同 host 绝对地址 → 收敛为相对路径；其余（含同主域子域）保持原样
    if (abs.host === TARGET_HOST) {
      return abs.pathname + abs.search + abs.hash;
    }
    return u;
  }
  window.__filecat_wrap__ = wrap;

  // fetch / XHR / WebSocket：把同目标绝对 URL 收敛为相对路径
  try {
    var rawFetch = window.fetch;
    if (rawFetch) {
      window.fetch = function(input, init) {
        try {
          if (typeof input === 'string') input = wrap(input);
          else if (input instanceof URL) input = wrap(input.href);
          else if (input && input.url) {
            var new_url = wrap(input.url);
            if (new_url !== input.url) {
              var req_init = {
                method: input.method, headers: input.headers, mode: input.mode,
                credentials: input.credentials, cache: input.cache, redirect: input.redirect,
                referrer: input.referrer, referrerPolicy: input.referrerPolicy,
                integrity: input.integrity, keepalive: input.keepalive, signal: input.signal
              };
              if (!input.bodyUsed && input.method !== 'GET' && input.method !== 'HEAD') {
                try { req_init.body = input.clone().body; req_init.duplex = 'half'; } catch(e) {}
              }
              input = new Request(new_url, req_init);
            }
          }
        } catch(e) {}
        return rawFetch.call(this, input, init);
      };
    }
  } catch(e) {}

  try {
    var rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = wrap(url);
      return rawOpen.apply(this, args);
    };
  } catch(e) {}

  try {
    var rawWS = window.WebSocket;
    if (rawWS) {
      var WSProxy = function(url, protocols) {
        try { url = wrap(url).replace(/^http/, 'ws'); } catch(e) {}
        return protocols === undefined ? new rawWS(url) : new rawWS(url, protocols);
      };
      // 静态常量与原型必须保留，否则页面里 WebSocket.OPEN / instanceof 等判断会失效
      WSProxy.CONNECTING = rawWS.CONNECTING;
      WSProxy.OPEN = rawWS.OPEN;
      WSProxy.CLOSING = rawWS.CLOSING;
      WSProxy.CLOSED = rawWS.CLOSED;
      WSProxy.prototype = rawWS.prototype;
      window.WebSocket = WSProxy;
    }
  } catch(e) {}

  // setAttribute：动态给 <a>/<img>/<script> 等设置 URL 属性时统一改写
  try {
    var rawSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      try {
        var n = String(name).toLowerCase();
        if ((n === 'src' || n === 'href' || n === 'action' || n === 'poster' || n === 'formaction' || n === 'data-src') &&
            typeof value === 'string' && value &&
            !/^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(value)) {
          value = wrap(value);
        }
      } catch(e) {}
      return rawSetAttribute.call(this, name, value);
    };
  } catch(e) {}

  // property setter：el.href = '...' / el.src = '...' 这类赋值同样改写
  function hook_url_props(proto, prop) {
    try {
      var desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.set || !desc.get) return;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: function() { return desc.get.call(this); },
        set: function(v) {
          if (typeof v === 'string' && v && !/^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(v)) {
            v = wrap(v);
          }
          return desc.set.call(this, v);
        }
      });
    } catch(e) {}
  }
  try {
    ['href', 'src'].forEach(function(prop) {
      [HTMLAnchorElement, HTMLScriptElement, HTMLLinkElement, HTMLImageElement,
       HTMLIFrameElement, HTMLSourceElement, HTMLMediaElement].forEach(function(Ctor) {
        if (typeof Ctor !== 'undefined' && Ctor && Ctor.prototype) hook_url_props(Ctor.prototype, prop);
      });
    });
  } catch(e) {}

  // history：只改地址栏，不触发加载
  try {
    ['pushState', 'replaceState'].forEach(function(fn) {
      var raw = history[fn];
      if (!raw) return;
      history[fn] = function(state, title, url) {
        if (url != null) url = wrap(url);
        return raw.call(this, state, title, url);
      };
    });
  } catch(e) {}

  // location 导航：只 hook assign/replace 函数
  try {
    var loc = window.location;
    var rawAssign = loc.assign.bind(loc);
    var rawReplace = loc.replace.bind(loc);
    loc.assign = function(u) { rawAssign(wrap(u)); };
    loc.replace = function(u) { rawReplace(wrap(u)); };
  } catch(e) {}

  // form.submit / sendBeacon / EventSource
  try {
    if (typeof HTMLFormElement !== 'undefined') {
      var rawSubmit = HTMLFormElement.prototype.submit;
      HTMLFormElement.prototype.submit = function() {
        try {
          var a = this.getAttribute('action');
          if (a) this.setAttribute('action', wrap(a));
        } catch(e) {}
        return rawSubmit.call(this);
      };
    }
    if (navigator && typeof navigator.sendBeacon === 'function') {
      var rawBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function(url, data) {
        try { url = wrap(url); } catch(e) {}
        return rawBeacon(url, data);
      };
    }
    if (typeof EventSource !== 'undefined') {
      var RawES = EventSource;
      var NewES = function(url, cfg) { return new RawES(wrap(url), cfg); };
      NewES.prototype = RawES.prototype;
      try { window.EventSource = NewES; } catch(e) {}
    }
  } catch(e) {}

  // DOM 监听兜底：知网等页面用 innerHTML / appendChild / 框架渲染动态插入带 URL 属性的元素，
  // 这些路径绕过了上面的 setAttribute / property hook，这里统一在节点插入后改写一次。
  try {
    var URL_ATTRS = ['href', 'src', 'action', 'poster', 'formaction', 'data-src'];
    function fix_el(el) {
      if (!el || el.nodeType !== 1) return;
      for (var i = 0; i < URL_ATTRS.length; i++) {
        var a = URL_ATTRS[i];
        var v = el.getAttribute && el.getAttribute(a);
        if (v && typeof v === 'string' && !/^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(v)) {
          var nv = wrap(v);
          if (nv !== v) el.setAttribute(a, nv);
        }
      }
      // srcset 单独处理
      var ss = el.getAttribute && el.getAttribute('srcset');
      if (ss) {
        var ns = ss.split(',').map(function(seg) {
          var s = seg.trim(); if (!s) return seg;
          var sp = s.split(/\s+/); var one = wrap(sp[0]);
          return ' ' + [one].concat(sp.slice(1)).join(' ');
        }).join(',');
        if (ns.replace(/^ /, '') !== ss) el.setAttribute('srcset', ns.replace(/^ /, ''));
      }
    }
    function fix_tree(node) {
      if (!node) return;
      if (node.nodeType === 1) {
        fix_el(node);
        var kids = node.querySelectorAll ? node.querySelectorAll('[href],[src],[action],[poster],[formaction],[data-src],[srcset]') : [];
        for (var i = 0; i < kids.length; i++) fix_el(kids[i]);
      }
    }
    var mo = new MutationObserver(function(muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) fix_tree(m.addedNodes[j]);
        } else if (m.type === 'attributes' && m.target) {
          // 属性被 JS 直接改（未走 setAttribute 的情况，极少）也兜一次
          fix_el(m.target);
        }
      }
    });
    var start_observe = function() {
      if (document.documentElement) {
        mo.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: URL_ATTRS});
      }
    };
    if (document.documentElement) start_observe();
    else document.addEventListener('DOMContentLoaded', start_observe);
    // 首次扫描已有 DOM
    fix_tree(document.documentElement);
  } catch(e) {}

  // 点击兜底：极少数在事件回调里现拼 href 的场景
  try {
    document.addEventListener('click', function(e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.tagName === 'A' && el.hasAttribute('href')) break;
        el = el.parentNode;
      }
      if (!el || el.tagName !== 'A') return;
      var href = el.getAttribute('href');
      if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) return;
      if (/^https?:\\/\\//i.test(href)) {
        el.setAttribute('href', wrap(href));
      }
    }, true);
  } catch(e) {}

})();
</script>`;
}

/**
 * 端口模式的请求处理入口。
 * 调用方（端口服务）已经根据端口定位到唯一目标，这里负责：
 *   请求头透传 → 上游请求 → 响应头/Cookie/Location 处理 → HTML 改写与脚本注入
 *
 * @param req        客户端请求
 * @param res        客户端响应
 * @param target_url 上游目标 URL（proto + host + path）
 * @param target_host 目标站 host（用于同站判断）
 * @param cross_routes 其它已配置目标（用于把页面里指向它们的地址改写到对应端口）；可选
 */
export function handle_browser_proxy_port_request(req: Request, res: Response, target_url: URL, target_host: string, cross_routes: ProxyTargetRoute[] = []): void {
    const is_https = target_url.protocol === 'https:';
    const agent = is_https ? https : http;

    const headers: Record<string, any> = {};
    for (const [k, v] of Object.entries(req.headers)) {
        if (STRIP_REQ_HEADERS.has(k.toLowerCase())) {
            continue;
        }
        headers[k] = v;
    }
    headers['accept-encoding'] = 'gzip, deflate';

    const raw_referer = req.headers.referer;
    headers['referer'] = raw_referer ? restore_port_referer(String(raw_referer), cross_routes, target_url) : `${target_url.origin}/`;
    headers['origin'] = target_url.origin;

    const options: http.RequestOptions = {
        method: req.method,
        hostname: target_url.hostname,
        port: target_url.port || (is_https ? 443 : 80),
        path: target_url.pathname + target_url.search,
        headers,
        timeout: REQUEST_TIMEOUT,
    };

    const proxy = HttpRequest.get_proxy();
    if (proxy) {
        options.agent = new HttpsProxyAgent(proxy);
    }

    // 端口模式下的「页面绝对地址」（用于相对 URL 解析）：由调用方把原始端口回填到 req 上
    const page_url: URL = (req as any).__page_url ?? target_url;

    // 跨目标改写上下文：
    //   · 当前请求主机（浏览器地址栏 host，用于拼其它目标的端口地址）
    //   · 跨目标匹配器（排除当前目标自身，由调用方通过 __port 告知）
    const req_host = String(req.headers['host'] || '');
    const cur_port = Number((req as any).__port || 0);
    const peer_routes = cur_port ? cross_routes.filter(r => r.port !== cur_port) : cross_routes;
    const rewrite_ctx: PortRewriteCtx = {
        match_cross: build_cross_target_matcher(peer_routes, target_host),
        filecat_hostname: req_host.replace(/:\d+$/, ''),
        target_ports: new Set(cross_routes.map(r => r.port)),
        routes: peer_routes,
    };

    const proxy_req = agent.request(options, (proxy_res) => {
        const content_type = String(proxy_res.headers['content-type'] ?? '');
        const status = proxy_res.statusCode ?? 502;
        const up_encoding = String(proxy_res.headers['content-encoding'] ?? '').toLowerCase();

        for (const [k, v] of Object.entries(proxy_res.headers)) {
            const lk = k.toLowerCase();
            if (STRIP_RES_HEADERS.has(lk) || lk === 'set-cookie') {
                continue;
            }
            if (lk === 'location') {
                const loc = Array.isArray(v) ? v[0] : String(v);
                // 端口模式：跨目标→目标端口；同目标跳转收敛为相对路径；跨域保持原样
                res.setHeader('location', port_wrap_location(loc, target_url, target_host, rewrite_ctx));
                continue;
            }
            if (v !== undefined) {
                res.setHeader(k, v);
            }
        }

        // Cookie：端口模式天然按 Origin 隔离，这里只需去掉 Domain（避免被上游域限制）
        const set_cookie = proxy_res.headers['set-cookie'];
        if (set_cookie) {
            const arr = Array.isArray(set_cookie) ? set_cookie : [set_cookie];
            res.setHeader('set-cookie', arr.map(c => strip_cookie_domain(c)));
        }

        if (!is_document_request(req) || !is_html(content_type)) {
            res.statusCode = status;
            if (!res.getHeader('content-type') && content_type) {
                res.setHeader('content-type', content_type);
            }
            if (up_encoding && up_encoding !== 'identity') {
                res.setHeader('content-encoding', up_encoding);
            }
            const up_len = proxy_res.headers['content-length'];
            if (up_len !== undefined) {
                res.setHeader('content-length', Array.isArray(up_len) ? up_len[0] : up_len);
            }
            proxy_res.pipe(res);
            return;
        }

        const chunks: Buffer[] = [];
        proxy_res.on('data', (c: Buffer) => chunks.push(c));
        proxy_res.on('end', () => {
            try {
                const charset = get_charset(content_type);
                let html = iconv.decode(decode_body(Buffer.concat(chunks), up_encoding), charset);
                html = port_rewrite_html(html, page_url, target_url, target_host, rewrite_ctx);
                html = inject_script_before_first_script(html, build_port_inject_script(page_url, target_url, target_host, rewrite_ctx));
                const buf = iconv.encode(html, charset);
                res.statusCode = status;
                res.setHeader('content-type', content_type || 'text/html; charset=utf-8');
                res.setHeader('content-length', String(buf.length));
                res.end(buf);
            } catch (e: any) {
                send_plain(res, 500, `browser proxy: rewrite failed: ${e?.message ?? e}`);
            }
        });
        proxy_res.on('error', () => {
            send_plain(res, 502, 'browser proxy: upstream stream error');
        });
    });

    proxy_req.on('timeout', () => proxy_req.destroy(new Error('browser proxy: request timeout')));
    proxy_req.on('error', (e: any) => {
        send_plain(res, 502, `browser proxy: ${e?.message ?? e}`);
    });

    const m = (req.method || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') {
        proxy_req.end();
    } else {
        req.pipe(proxy_req);
    }
}

/** 端口模式：重定向地址处理（跨目标→目标端口；同 host→相对路径；其它→原样） */
function port_wrap_location(loc: string, base: URL, target_host: string, ctx: PortRewriteCtx): string {
    if (!loc || /^(data:|blob:|javascript:)/i.test(loc)) {
        return loc;
    }
    try {
        const u = new URL(loc, base);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return loc;
        }
        // 跨目标优先：指向另一个已配置目标 → 改写成该目标端口地址
        const hit = ctx.match_cross(u.host);
        if (hit) {
            return cross_target_url(u, hit, ctx.filecat_hostname);
        }
        if (u.host === target_host) {
            return u.pathname + u.search + u.hash;
        }
        // 其它（含同主域子域、跨域）→ 原样
        return loc;
    } catch {
        return loc;
    }
}

/** 端口模式：Cookie 只去掉 Domain，其余属性保留（Origin 隔离由端口天然保证） */
function strip_cookie_domain(raw: string): string {
    return raw.split(';').filter(seg => !/^\s*domain\s*=/i.test(seg)).join(';');
}

/**
 * 端口模式：把 Referer 从「代理地址」还原成「真实上游地址」。
 *
 * 浏览器发出的 Referer 形如 http://127.0.0.1:5611/xxx 或 http://127.0.0.1:5612/xxx。
 * 直接把 127.0.0.1 透传给上游，会被目标站（如知网）判为异常并触发风控/404，
 * 所以这里按端口还原成真实上游来源。
 *
 * @param referer      浏览器带来的 Referer（代理地址）
 * @param routes       全部已配置目标（含 proto/host/port）
 * @param current_url  本次请求对应的真实上游 URL（用于兜底）
 */
function restore_port_referer(referer: string, routes: ProxyTargetRoute[], current_url: URL): string {
    if (!referer) {
        return `${current_url.origin}/`;
    }
    let u: URL;
    try {
        u = new URL(referer);
    } catch {
        return `${current_url.origin}/`;
    }
    // 只处理指向本机代理端口的 Referer；其它（如已是真实地址）保持原样
    const port = Number(u.port);
    if (!port) {
        return referer;
    }
    // 按端口找到对应目标，用其 proto://host 还原
    const target = routes.find(r => r.port === port);
    if (target) {
        const proto = target.proto || 'https';
        return `${proto}://${target.host}/`;
    }
    return `${current_url.origin}/`;
}

/** 端口模式的 res 是原生 ServerResponse（无 Express 的 status/send），这里统一回写文本 */
function send_plain(res: Response, status: number, text: string) {
    if (res.headersSent) {
        res.end();
        return;
    }
    res.statusCode = status;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(text);
}

/** 上游 WebSocket 连接超时（建连阶段） */
const WS_CONNECT_TIMEOUT = 15000;

/**
 * 端口模式的 WebSocket 升级处理入口。
 *
 * 采用「裸隧道」方案：不解析 ws 帧，把浏览器发来的握手报文改写 Host 后原样转发给上游，
 * 之后两个 socket 直接对接。好处是天然同时支持 ws 与 wss 上游、支持任意子协议/扩展，
 * 且不需要额外依赖。
 *
 * 注意：上游依赖 item.proto（http→ws / https→wss），因此调用方传入的是目标的 proto。
 *
 * @param proto   目标上游协议（http / https）
 * @param host    目标上游主机（可能含端口，如 example.com:8080）
 * @param req     浏览器发来的升级请求
 * @param socket  浏览器侧的原始 socket
 * @param head    升级请求中已读取但未消费的字节
 */
export function handle_browser_proxy_port_upgrade(proto: string, host: string, req: IncomingMessage, socket: net.Socket, head: Buffer): void {
    const is_secure = proto === 'https';
    // 目标主机可能自带端口；未指定时按协议给默认端口
    const host_no_port = host_without_port(host);
    const port_match = /:(\d+)$/.exec(host);
    const port = port_match ? Number(port_match[1]) : (is_secure ? 443 : 80);

    let settled = false;
    const fail = (status: number, text: string) => {
        if (settled) {
            return;
        }
        settled = true;
        if (socket.writable) {
            socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
        }
        socket.destroy();
    };

    const on_connected = () => {
        if (settled) {
            upstream.destroy();
            return;
        }
        settled = true;
        upstream.setTimeout(0);
        // 改写握手报文的 Host 为真实上游主机（浏览器发来的 Host 是本机代理端口）
        const lines = build_upgrade_request(req, host);
        upstream.write(lines);
        if (head && head.length) {
            upstream.write(head);
        }
        // 双向裸转发
        socket.pipe(upstream);
        upstream.pipe(socket);
    };

    const upstream = is_secure
        ? tls.connect({host: host_no_port, port, servername: host_no_port}, on_connected)
        : net.connect({host: host_no_port, port}, on_connected);

    upstream.setTimeout(WS_CONNECT_TIMEOUT, () => {
        fail(504, 'Gateway Timeout');
    });
    upstream.on('error', () => fail(502, 'Bad Gateway'));
    upstream.on('close', () => {
        if (!settled) {
            fail(502, 'Bad Gateway');
            return;
        }
        socket.destroy();
    });
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
}

/** 代理自身的鉴权 cookie 名（不向上游透传） */
const BP_TOKEN_COOKIE = 'filecat_bp_token';

/**
 * 用浏览器发来的升级请求重建握手报文（保证请求行/头部不变，仅替换 Host 为本机收到的原样）。
 * 由于 Host 已被上游认可（多数 ws 服务端不校验），这里保持浏览器原始 Host，
 * 只补上 Connection/Upgrade 等 ws 必需头（它们原本就在原始请求里，直接沿用）。
 */
function build_upgrade_request(req: IncomingMessage, host: string): string {
    const method = req.method || 'GET';
    const url = req.url || '/';
    const version = req.httpVersion || '1.1';
    const lines = [`${method} ${url} HTTP/${version}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i];
        const value = req.rawHeaders[i + 1];
        const lname = name.toLowerCase();
        // 上游 ws 服务端拿到本机代理端口会误判来源，统一替换成目标 host
        if (lname === 'host') {
            lines.push(`${name}: ${host}`);
            continue;
        }
        // 代理鉴权 cookie 混着目标站 cookie，只剔除代理自己那条
        if (lname === 'cookie') {
            const cleaned = String(value).split(';')
                .filter(seg => !new RegExp(`^\\s*${BP_TOKEN_COOKIE}\\s*=`).test(seg))
                .join(';').trim();
            if (cleaned) {
                lines.push(`${name}: ${cleaned}`);
            }
            continue;
        }
        lines.push(`${name}: ${value}`);
    }
    return lines.join('\r\n') + '\r\n\r\n';
}
