/**
 * 网页代理中间件 —— 复用 FileCat 自身端口，不额外监听端口。
 *
 * URL 形式（参考深信服/网瑞达 WebVPN）：
 *   {sys_pre}/browser_proxy/{token}/{协议}/{域名}/路径?查询
 *   例：/browser_proxy/xxx/https/example.com/a/b?x=1
 *       /browser_proxy/xxx/http/192.168.1.1:8080/api
 *
 * 原理：浏览器始终与我们同源（127.0.0.1），由本中间件代发上游请求，
 * 再把响应里的地址改写回代理形式，使站内跳转持续走代理。
 *
 * 改址的三层机制：
 *   1. HTML 重写 —— 把 script/link/img/a/form 等属性里的绝对地址、
 *      根相对地址改成代理地址（需先整体匹配标签再取属性，避免改坏 JS 代码）
 *   2. 注入 hook 脚本 —— 拦 fetch/XHR/WebSocket/history/location/el.src 等
 *      运行时动态拼出的地址
 *   3. 响应头改写 —— Set-Cookie 隔离到本站代理路径、Location 重写回代理
 *
 * 服务端另有一层 Referer 兜底：站点用 location.origin 拼出的地址会丢失
 * 代理前缀（直接打到我们域名根路径），这类请求由 Referer 还原目标站后转发。
 *
 * 代理范围（重要取舍）：
 *   只代理「目标站自身 + 同主域子域」（如 gitee.com 与 cn-assets.gitee.com）。
 *   真正跨主域的地址保持原样，点击会跳出代理 —— 跨域请求即使改写了
 *   也仍会被浏览器同源策略拦截。
 *
 * Cookie 隔离：
 *   所有站点共用同一 origin，cookie 只按「域名 + 路径」区分。所以每个站的
 *   Set-Cookie 都被改写成 Path=/browser_proxy/{token}/{proto}/{host}/，
 *   各站 cookie 互不可见、互不覆盖（否则知网与路由器的 SID 会互相顶掉，
 *   表现为登录成功后又被弹回登录页）。
 *
 * 其他取舍：
 *   · 请求时强制 Accept-Encoding: identity，逼目标站返回明文，省去解压再压缩
 *   · 用 iconv-lite 按 charset 解码，兼容 GBK 等中文站点
 */
import {NextFunction, Request, Response} from 'express';
import http from 'http';
import https from 'https';
import iconv from 'iconv-lite';
import zlib from 'zlib';
import {URL} from 'url';
import {HttpsProxyAgent} from 'https-proxy-agent';
import {HttpRequest} from '../../../common/node/http';
import {UserAuth} from '../../../common/req/user.req';
import {userService} from '../../domain/user/user.service';

/** 代理路径前缀（相对 base_url） */
export const PROXY_PATH = '/browser_proxy';


const REQUEST_TIMEOUT = 30000;

const INJECT_ID = '__filecat_webvpn_script__';

/** 脚本执行标记（挂在 window 上，避免重复注入时重复 hook） */
const INJECT_FLAG = '__filecat_webvpn__';

/** 静态资源扩展名（用于 sec-fetch-dest 缺失时判断） */
const ASSET_EXT_RE = /\.(js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|json|map|txt|xml)(\?|$)/i;

/** 可能承载 JS 内容、但上游常标成 text/html 的扩展名（老式管理页常见） */
const ASSET_SCRIPT_RE = /\.(js|mjs|asp|aspx|cgi|php|do)(\?|$)/i;


function try_fallback_by_referer(req: Request, res: Response, sys_pre: string): boolean {
    const method = String(req.method || '').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
        return false;
    }
    const raw_url = req.originalUrl || req.url || '';
    if (sys_pre && raw_url.startsWith(sys_pre)) {
        return false;
    }

    const dest = String(req.headers['sec-fetch-dest'] || '');
    if (dest === 'document' || dest === 'iframe') {
        return false;
    }
    if (!dest && !ASSET_EXT_RE.test(raw_url)) {
        return false;
    }
    const referer = req.headers.referer;
    if (!referer) {
        return false;
    }
    // 从 Referer 里还原目标站：.../{PROXY_PATH}/{token}/{proto}/{host}/...
    const parsed = parse_proxy_url(String(referer));
    if (!parsed) {
        return false;
    }

    let target_url: URL;
    try {
        target_url = new URL(`${parsed.proto}://${parsed.host}${raw_url}`);
    } catch {
        return false;
    }
    const prefix = make_proxy_prefix(sys_pre, parsed.token, parsed.proto, parsed.host);
    forward(req, res, target_url, prefix);
    return true;
}

/** 从代理地址里解析出 token / proto / host；非代理地址返回 null */
function parse_proxy_url(url: string): {token: string, proto: string, host: string} | null {
    const marker = `${PROXY_PATH}/`;
    const i = url.indexOf(marker);
    if (i === -1) {
        return null;
    }
    let rest = url.slice(i + marker.length);
    const q = rest.indexOf('?');
    if (q !== -1) {
        rest = rest.slice(0, q);
    }
    const hash = rest.indexOf('#');
    if (hash !== -1) {
        rest = rest.slice(0, hash);
    }
    const parts = rest.split('/');
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
        return null;
    }

    if (parts[3] === PROXY_PATH.slice(1) && parts.length >= 7 && parts[6]) {
        return {
            token: decodeURIComponent(parts[4]),
            proto: parts[5],
            host: decodeURIComponent(parts[6]),
        };
    }
    return {
        token: decodeURIComponent(parts[0]),
        proto: parts[1],
        host: decodeURIComponent(parts[2]),
    };
}

/** 不向上游转发的请求头（影响响应形态或会造成回环） */
const STRIP_REQ_HEADERS = new Set([
    'host', 'connection', 'keep-alive', 'proxy-connection',

    'transfer-encoding',
    'upgrade', 'accept-encoding', 'referer', 'origin',
]);

/** 不向浏览器回传的响应头（安全策略类会拦住 iframe，编码/长度类由我们自己控制） */
const STRIP_RES_HEADERS = new Set([
    'content-security-policy', 'content-security-policy-report-only',
    'x-frame-options', 'content-encoding', 'content-length',
    'strict-transport-security', 'clear-site-data',
    'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy',
    'transfer-encoding', 'connection', 'keep-alive', 'trailer', 'upgrade',
]);


function rewrite_urls(html: string, prefix: string, target: URL): string {
    // 只匹配真正的 HTML 标签：<tagname ...>（不含注释、不含 <!doctype）
    const tag_re = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;

    return html.replace(tag_re, (whole, tag_name, attrs) => {
        // 标签自身已是代理注入的（script id=...），内容是我们自己写的，跳过
        if (tag_name.toLowerCase() === 'base' && /\bdata-filecat\b/.test(attrs)) {
            return whole;
        }
        const new_attrs = attrs.replace(ATTR_RE, (m, name, eq, _all, dq, sq, uq) => {
            const lname = name.toLowerCase();
            if (!URL_ATTRS.has(lname)) {
                return m;
            }
            // 还原引号形态，便于保持原样输出
            const raw = dq !== undefined ? dq : (sq !== undefined ? sq : uq);
            if (raw == null || raw === '') {
                return m;
            }
            if (raw.startsWith(prefix) || raw.startsWith('/browser_proxy')) {
                return m;
            }
            const wrapped = wrap_url_value(raw, prefix, target);
            if (wrapped === null) {
                return m;
            }
            const quote = dq !== undefined ? '"' : (sq !== undefined ? "'" : '');
            return `${name}${eq}${quote}${wrapped}${quote}`;
        });
        return `<${tag_name}${new_attrs}>`;
    });
}

/** 需要改写的 URL 属性白名单 */
const URL_ATTRS = new Set([
    'src', 'href', 'action', 'poster', 'formaction', 'data-src', 'cite', 'background', 'srcset',
]);


function rewrite_css_urls(html: string, prefix: string, target: URL): string {
    const fix = (css: string) => css
        .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, quote, raw) => {
            const one = to_proxy_path(raw, prefix, target);
            return one === null ? m : `url(${quote}${one}${quote})`;
        })
        .replace(/@import\s+(["'])([^"']+)\1/gi, (m, quote, raw) => {
            const one = to_proxy_path(raw, prefix, target);
            return one === null ? m : `@import ${quote}${one}${quote}`;
        });

    return html
        .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, css, close) => {
            return `${open}${fix(css)}${close}`;
        })
        .replace(/(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, lead, _all, dq, sq) => {
            const val = dq !== undefined ? dq : sq;
            const quote = dq !== undefined ? '"' : "'";
            return `${lead}${quote}${fix(val)}${quote}`;
        });
}

/** 重写 meta refresh 的跳转地址 */
function rewrite_meta_refresh(html: string, prefix: string, target: URL): string {
    return html.replace(
        /(<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]+content\s*=\s*["'])([^"']*)(["'])/gi,
        (m, head, content, tail) => {
            const replaced = content.replace(/(url\s*=\s*)([^\s;]+)/i, (mm, key, raw) => {
                const one = to_proxy_path(raw.replace(/^["']|["']$/g, ''), prefix, target);
                return one === null ? mm : `${key}${one}`;
            });
            return `${head}${replaced}${tail}`;
        },
    );
}

/**
 * 把单个地址值转成代理路径；不属于目标站的返回 null（表示保持原样）。
 * 兼容 srcset 这种「逗号分隔 + 空格描述符」的候选列表写法。
 */
function wrap_url_value(raw: string, prefix: string, target: URL): string | null {
    if (/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(raw)) {
        return null;
    }
    // srcset 候选列表："a.png 1x, b.png 2x"，逐项转换
    if (/,/.test(raw) && !/^https?:\/\//i.test(raw)) {
        let changed = false;
        const rebuilt = raw.split(',').map(seg => {
            const s = seg.trim();
            if (!s) {
                return seg;
            }
            const sp = s.split(/\s+/);
            const one = wrap_url_value(sp[0], prefix, target);
            if (one === null) {
                return seg;
            }
            changed = true;
            return ` ${[one, ...sp.slice(1)].join(' ')}`;
        }).join(',');
        return changed ? rebuilt.replace(/^ /, '') : null;
    }

    const one = to_proxy_path(raw, prefix, target);
    return one;
}

/** 单个 URL → 代理路径；非目标站的返回 null */
function to_proxy_path(raw: string, prefix: string, target: URL): string | null {
    // 纯锚点 "#x" 是页内跳转，保持原样
    if (raw.startsWith('#')) {
        return null;
    }
    // 协议相对 "//host/path"：补上目标站协议再判断
    const candidate = raw.startsWith('//') ? `${target.protocol}${raw}` : raw;
    let abs: URL;
    try {
        abs = new URL(candidate, target);
    } catch {
        return null;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') {
        return null;
    }

    if (abs.pathname.startsWith(prefix + '/')) {
        return null;
    }
    if (!is_same_site_host(abs.host, target.host)) {
        return null;
    }

    const host_index = prefix.lastIndexOf('/') + 1;
    const head = prefix.slice(0, host_index);
    return `${head}${abs.host}${abs.pathname}${abs.search}${abs.hash}`;
}

function is_same_site_host(a: string, b: string): boolean {
    const norm = (h: string) => h.replace(/^www\./, '').toLowerCase();
    const ha = norm(a);
    const hb = norm(b);
    if (ha === hb) {
        return true;
    }
    const root = (h: string) => {
        const parts = h.split('.');
        return parts.length <= 2 ? h : parts.slice(-2).join('.');
    };
    return root(ha) === root(hb);
}


function build_inject_script(prefix: string, page_url: URL): string {

    const prefix_head = prefix.slice(0, prefix.lastIndexOf('/') + 1);
    return `<script id="${INJECT_ID}">
(function(){
  if (window.${INJECT_FLAG}) return;
  window.${INJECT_FLAG} = true;
  var PREFIX = ${JSON.stringify(prefix)};
  var PREFIX_HEAD = ${JSON.stringify(prefix_head)};
  var PAGE = ${JSON.stringify(page_url.href)};
  var TARGET_HOST = ${JSON.stringify(page_url.host)};

  
  function safe(fn) {
    try { return fn(); } catch(e) { /* 单个 hook 失败不影响其他 */ }
  }


  function wrap(u) {
    if (u == null) return u;
    u = String(u);
    if (!u) return u;
    if (/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(u)) return u;
    var abs;
    try { abs = new URL(u, PAGE); } catch(e) { return u; }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return u;

    
    if (is_proxy_path(abs.pathname)) return u;

   
    if (is_target_host(abs.host)) {
      return PREFIX_HEAD + abs.host + abs.pathname + abs.search + abs.hash;
    }
   
    if (abs.host === location.host) {
      return PREFIX_HEAD + TARGET_HOST + abs.pathname + abs.search + abs.hash;
    }
    // 跨站，保持原样
    return u;
  }

 
  function is_proxy_path(pathname) {
    return pathname.indexOf(PREFIX_HEAD) === 0 && pathname.length > PREFIX_HEAD.length;
  }

  /** 取注册主域（末两段），用于判断是否同站 */
  function root_domain(h) {
    var parts = String(h).replace(/^www\\./, '').toLowerCase().split('.');
    return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.');
  }

 
  function is_target_host(host) {
    var clean = function(h) { return String(h).replace(/^www\\./, '').toLowerCase(); };
    if (clean(host) === clean(TARGET_HOST)) return true;
    return root_domain(host) === root_domain(TARGET_HOST);
  }
 
  window.__filecat_wrap__ = wrap;

  safe(function() {
   
    var NS = 'fcns_' + String(TARGET_HOST).replace(/[^0-9a-zA-Z_.-]/g, '_') + ':';

    function make_view(real) {
      function real_key(k) { return NS + String(k); }
      function own_key(k) { return k.slice(NS.length); }
      function own_keys() {
        var out = [];
        for (var i = 0; i < real.length; i++) {
          var k = real.key(i);
          if (k && k.indexOf(NS) === 0) out.push(own_key(k));
        }
        return out;
      }
      var api = {
        getItem: function(k) { return real.getItem(real_key(k)); },
        setItem: function(k, v) { return real.setItem(real_key(k), v); },
        removeItem: function(k) { return real.removeItem(real_key(k)); },
        clear: function() {
          // 只清自己的命名空间，绝不碰 filecat 的键
          own_keys().forEach(function(k) { real.removeItem(real_key(k)); });
        },
        key: function(i) {
          var keys = own_keys();
          return i >= 0 && i < keys.length ? keys[i] : null;
        },
      };
      return new Proxy(api, {
        get: function(t, p) {
          if (p === 'length') return own_keys().length;
          if (p in t) return t[p];
          var v = real[p];
          return typeof v === 'function' ? v.bind(real) : v;
        },
        has: function(t, p) {
          if (p === 'length') return true;
          if (p in t) return true;
          return own_keys().indexOf(String(p)) !== -1;
        },
        ownKeys: function() { return own_keys(); },
        getOwnPropertyDescriptor: function(t, p) {
          var v = real.getItem(real_key(p));
          if (v === null) return undefined;
          return { value: v, writable: true, enumerable: true, configurable: true };
        },
      });
    }

    ['localStorage', 'sessionStorage'].forEach(function(name) {
      try {
        var real = window[name];
        if (!real) return;
        var view = make_view(real);
      
        Object.defineProperty(window, name, {
          get: function() { return view; },
          configurable: true,
        });
      } catch(e) {}
    });
  });

  // ---------- 1. fetch ----------
  safe(function() {
    var rawFetch = window.fetch;
    if (rawFetch) {
      window.fetch = function(input, init) {
        try {
          if (typeof input === 'string') {
            input = wrap(input);
          } else if (input instanceof URL) {
            input = wrap(input.href);
          } else if (input && input.url) {
            input = new Request(wrap(input.url), input);
          }
        } catch(e) {}
        return rawFetch.call(this, input, init);
      };
    }
  });

  // ---------- 2. XMLHttpRequest ----------
  safe(function() {
    var rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = wrap(url);
      return rawOpen.apply(this, args);
    };
  });

  // ---------- 3. WebSocket ----------
  safe(function() {
    var rawWS = window.WebSocket;
    if (rawWS) {
      window.WebSocket = function(url, protocols) {
        try { url = wrap(url).replace(/^http/, 'ws'); } catch(e) {}
        return protocols === undefined ? new rawWS(url) : new rawWS(url, protocols);
      };
      window.WebSocket.prototype = rawWS.prototype;
    }
  });

  // ---------- 4. history（只改地址栏，不触发加载）----------
  safe(function() {
    ['pushState','replaceState'].forEach(function(fn){
      var raw = history[fn];
      if (!raw) return;
      history[fn] = function(state, title, url) {
        if (url != null) url = wrap(url);
        return raw.call(this, state, title, url);
      };
    });
  });

  // ---------- 5. location 导航 ----------
  // location 对象只读，多数浏览器禁止整体重定义；只 hook assign/replace 函数
  safe(function() {
    var loc = window.location;
    var rawAssign = loc.assign.bind(loc);
    var rawReplace = loc.replace.bind(loc);
    loc.assign = function(u) { rawAssign(wrap(u)); };
    loc.replace = function(u) { rawReplace(wrap(u)); };
  });

 
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
  safe(function() {
    ['src', 'href'].forEach(function(prop){
      if (typeof HTMLScriptElement !== 'undefined') hook_url_props(HTMLScriptElement.prototype, prop);
      if (typeof HTMLLinkElement !== 'undefined') hook_url_props(HTMLLinkElement.prototype, prop);
      if (typeof HTMLImageElement !== 'undefined') hook_url_props(HTMLImageElement.prototype, prop);
      if (typeof HTMLIFrameElement !== 'undefined') hook_url_props(HTMLIFrameElement.prototype, prop);
      if (typeof HTMLSourceElement !== 'undefined') hook_url_props(HTMLSourceElement.prototype, prop);
      if (typeof HTMLMediaElement !== 'undefined') hook_url_props(HTMLMediaElement.prototype, prop);
    });
  });

  // ---------- 7. setAttribute 兜底 ----------
  safe(function() {
    var rawSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      try {
        var n = String(name).toLowerCase();
        if ((n === 'src' || n === 'href' || n === 'action' || n === 'poster') &&
            typeof value === 'string' && value &&
            !/^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(value)) {
          value = wrap(value);
        }
      } catch(e) {}
      return rawSetAttribute.call(this, name, value);
    };
  });


  safe(function() {
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
      var NewES = function(url, cfg) {
        return new RawES(wrap(url), cfg);
      };
      NewES.prototype = RawES.prototype;
      try { window.EventSource = NewES; } catch(e) {}
    }
  });

  safe(function() {
    document.addEventListener('click', function(e){
      var el = e.target;
      while (el && el !== document) {
        if (el.tagName === 'A' && el.hasAttribute('href')) break;
        el = el.parentNode;
      }
      if (!el || el.tagName !== 'A') return;
      var href = el.getAttribute('href');
      if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) return;
      // 完整绝对地址（跨站链接）走代理；已是代理地址的不再包装
      if (/^https?:\\/\\//i.test(href) && href.indexOf(PREFIX_HEAD) !== 0) {
        el.setAttribute('href', wrap(href));
      }
    }, true);
  });

})();
</script>`;
}

function decode_body(buf: Buffer, encoding: string): Buffer {
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
function is_html(content_type: string): boolean {
    return /text\/html|application\/xhtml\+xml/i.test(content_type);
}

function is_document_request(req: Request): boolean {
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


function inject_script_before_first_script(html: string, inject: string): string {
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
function get_charset(content_type: string): string {
    const m = /charset\s*=\s*"?([\w-]+)"?/i.exec(content_type);
    if (!m) {
        return 'utf-8';
    }
    const cs = m[1].toLowerCase();
    return cs === 'utf8' ? 'utf-8' : cs;
}

/** 拼代理前缀 */
function make_proxy_prefix(sys_pre: string, token: string, proto: string, host: string): string {
    return `${sys_pre}${PROXY_PATH}/${encodeURIComponent(token)}/${proto}/${host}`;
}

/**
 * 把「重定向地址」改写成代理地址。
 *
 * 同 to_proxy_path：需要用 abs.host 而不是当前请求的 host，
 * 因为服务端可能把我们重定向到同主域的另一个子域（如 CDN 域）。
 */
function rewrite_location(loc: string, base: URL, prefix: string): string {
    if (!loc || /^(data:|blob:|javascript:)/i.test(loc)) {
        return loc;
    }
    try {
        const u = new URL(loc, base);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return loc;
        }
        const head = prefix.slice(0, prefix.lastIndexOf('/') + 1);
        return `${head}${u.host}${u.pathname}${u.search}${u.hash}`;
    } catch {
        return loc;
    }
}


function fix_set_cookie(raw: string, prefix: string): string {
    const segs = raw.split(';').filter(seg => !/^\s*domain\s*=/i.test(seg));
    // cookie 的 Path 前缀必须以 '/' 结尾，否则 /a 会匹配到 /abc
    const scope = prefix.endsWith('/') ? prefix : `${prefix}/`;
    let has_path = false;
    const out = segs.map(seg => {
        const m = /^\s*path\s*=\s*(.*)$/i.exec(seg);
        if (!m) {
            return seg;
        }
        has_path = true;
        const raw_path = m[1].trim();
        // 上游根路径或空 → 直接用代理前缀；更深的路径 → 前缀 + 原路径
        const deeper = raw_path && raw_path !== '/';
        return deeper ? ` Path=${scope}${raw_path.replace(/^\//, '')}` : ` Path=${scope}`;
    });
    if (!has_path) {
        out.push(` Path=${scope}`);
    }
    return out.join(';');
}


export const use_browser_proxy_middleware = (sys_pre: string) => {
    const full_prefix = `${sys_pre}${PROXY_PATH}`;
    const marker = full_prefix + '/';

    return async (req: Request, res: Response, next: NextFunction) => {
        const raw_url = req.originalUrl || req.url || '';
        if (!raw_url.startsWith(marker)) {

            if (try_fallback_by_referer(req, res, sys_pre)) {
                return;
            }
            return next();
        }

        // 路径结构：{token}/{proto}/{host}{path}
        let rest = raw_url.slice(marker.length);
        const q_index = rest.indexOf('?');
        const suffix = q_index === -1 ? '' : rest.slice(q_index);
        if (q_index !== -1) {
            rest = rest.slice(0, q_index);
        }

        // 先取出 token 段
        const seg0 = rest.indexOf('/');
        const token_from_path = seg0 === -1 ? rest : rest.slice(0, seg0);
        const after_token = seg0 === -1 ? '' : rest.slice(seg0 + 1);

        // 权限校验：代理能访问任意外部站点，必须限定给有权限的账号
        const token = decodeURIComponent(token_from_path).trim();
        // get_user_info_by_token 对非法 token 会抛异常，这里兜住统一按无权限处理
        let allowed = false;
        if (token) {
            try {
                allowed = userService.have_user_auth(token, UserAuth.browser_proxy, false);
            } catch {
                allowed = false;
            }
        }
        if (!allowed) {
            res.status(403).send('browser proxy: permission denied');
            return;
        }

        // 前两段固定是协议和域名，其余才是路径：
        //   https/example.com/a/b  →  proto=https, host=example.com, path=/a/b
        //   https/example.com      →  proto=https, host=example.com, path=/
        const first_slash = after_token.indexOf('/');
        let proto = first_slash === -1 ? after_token : after_token.slice(0, first_slash);
        const after_proto = first_slash === -1 ? '' : after_token.slice(first_slash + 1);
        const second_slash = after_proto.indexOf('/');
        let host = second_slash === -1 ? after_proto : after_proto.slice(0, second_slash);
        let rest_path = second_slash === -1 ? '/' : after_proto.slice(second_slash);


        const di = rest_path.indexOf(`${PROXY_PATH}/`);
        if (di !== -1) {
            // 前缀后依次是 token / proto / host / path，token 段要一起跳过
            const segs = rest_path.slice(di + PROXY_PATH.length + 1).split('/');
            if (segs.length >= 4 && segs[1] && segs[2]) {
                proto = segs[1];
                host = decodeURIComponent(segs[2]);
                rest_path = '/' + segs.slice(3).join('/');
            }
        }

        if (proto !== 'http' && proto !== 'https') {
            res.status(400).send('browser proxy: protocol must be http or https');
            return;
        }
        if (!host) {
            res.status(400).send('browser proxy: missing host');
            return;
        }

        let target_url: URL;
        try {
            target_url = new URL(`${proto}://${host}${rest_path}${suffix}`);
        } catch {
            res.status(400).send('browser proxy: invalid target url');
            return;
        }

        // 前缀保留 token 段：这样注入的 <base> 与所有改写出的地址都天然带上鉴权
        const prefix = make_proxy_prefix(sys_pre, token, proto, host);
        forward(req, res, target_url, prefix);
    };
};

function restore_target_url(proxy_url: string, target: URL): string {
    const marker = `${PROXY_PATH}/`;
    const i = proxy_url.indexOf(marker);
    if (i === -1) {
        return `${target.origin}/`;
    }
    // 剥掉 /browser_proxy/{token}/{proto}/{host} 四段，剩下的就是目标站的原始形式
    const rest = proxy_url.slice(i + marker.length);
    const parts = rest.split('/');
    // parts = [token, proto, host, ...原路径]
    if (parts.length < 3) {
        return `${target.origin}/`;
    }
    const tail = parts.slice(3).join('/');
    return `${target.origin}/${tail}`;
}

/** 发起上游请求并回写响应 */
function forward(req: Request, res: Response, target_url: URL, prefix: string): void {
    const is_https = target_url.protocol === 'https:';
    const agent = is_https ? https : http;

    // 透传请求头（剥掉会干扰的）
    const headers: Record<string, any> = {};
    for (const [k, v] of Object.entries(req.headers)) {
        if (STRIP_REQ_HEADERS.has(k.toLowerCase())) {
            continue;
        }
        headers[k] = v;
    }

    headers['accept-encoding'] = 'gzip, deflate, br';


    const raw_referer = req.headers.referer;
    headers['referer'] = raw_referer ? restore_target_url(String(raw_referer), target_url) : `${target_url.origin}/`;
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

    const proxy_req = agent.request(options, (proxy_res) => {
        const content_type = String(proxy_res.headers['content-type'] ?? '');
        const status = proxy_res.statusCode ?? 502;

        const up_encoding = String(proxy_res.headers['content-encoding'] ?? '').toLowerCase();

        // 回写响应头
        for (const [k, v] of Object.entries(proxy_res.headers)) {
            const lk = k.toLowerCase();
            if (STRIP_RES_HEADERS.has(lk) || lk === 'set-cookie') {
                continue;
            }
            if (lk === 'location') {
                const loc = Array.isArray(v) ? v[0] : String(v);
                res.setHeader('location', rewrite_location(loc, target_url, prefix));
                continue;
            }
            if (v !== undefined) {
                res.setHeader(k, v);
            }
        }

        // Set-Cookie 处理（去 Domain、Path 收敛到本站代理前缀，实现站点间隔离）
        const set_cookie = proxy_res.headers['set-cookie'];
        if (set_cookie) {
            const arr = Array.isArray(set_cookie) ? set_cookie : [set_cookie];
            res.setHeader('set-cookie', arr.map(c => fix_set_cookie(c, prefix)));
        }

        if (!is_document_request(req) || !is_html(content_type)) {
            res.status(status);
            if (!res.getHeader('content-type') && content_type) {
                res.setHeader('content-type', content_type);
            }
            if (up_encoding && up_encoding !== 'identity') {
                res.setHeader('content-encoding', up_encoding);
            }
            // 上游若给了确切的 content-length，沿用（避免分块，利于浏览器进度显示）
            const up_len = proxy_res.headers['content-length'];
            if (up_len !== undefined) {
                res.setHeader('content-length', Array.isArray(up_len) ? up_len[0] : up_len);
            }
            proxy_res.pipe(res);
            return;
        }

        // 走到这里说明上游返回 HTML。
        const want = String(req.headers['sec-fetch-dest'] || '');

        if ((want === 'script' || want === 'style') && status >= 400) {
            res.status(200);
            res.setHeader('content-type', want === 'style' ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
            res.setHeader('content-length', '0');
            res.end();
            return;
        }


        if (want === 'script' && ASSET_SCRIPT_RE.test(req.path || '')) {
            res.status(status);
            res.setHeader('content-type', 'application/javascript; charset=utf-8');
            if (up_encoding && up_encoding !== 'identity') {
                res.setHeader('content-encoding', up_encoding);
            }
            const up_len2 = proxy_res.headers['content-length'];
            if (up_len2 !== undefined) {
                res.setHeader('content-length', Array.isArray(up_len2) ? up_len2[0] : up_len2);
            }
            proxy_res.pipe(res);
            return;
        }

        // HTML：注入 <base> 与 hook 脚本
        const chunks: Buffer[] = [];
        proxy_res.on('data', (c: Buffer) => chunks.push(c));
        proxy_res.on('end', () => {
            try {
                const charset = get_charset(content_type);
                let html = iconv.decode(decode_body(Buffer.concat(chunks), up_encoding), charset);


                html = rewrite_urls(html, prefix, target_url);
                html = rewrite_css_urls(html, prefix, target_url);
                html = rewrite_meta_refresh(html, prefix, target_url);


                html = inject_script_before_first_script(html, build_inject_script(prefix, target_url));

                const buf = iconv.encode(html, charset);
                res.status(status);
                res.setHeader('content-type', content_type || 'text/html; charset=utf-8');
                res.setHeader('content-length', String(buf.length));
                res.end(buf);
            } catch (e: any) {
                if (!res.headersSent) {
                    res.status(500).send(`browser proxy: rewrite failed: ${e?.message ?? e}`);
                } else {
                    res.end();
                }
            }
        });
        proxy_res.on('error', () => {
            if (!res.headersSent) {
                res.status(502).send('browser proxy: upstream stream error');
            } else {
                res.end();
            }
        });
    });

    proxy_req.on('timeout', () => proxy_req.destroy(new Error('browser proxy: request timeout')));
    proxy_req.on('error', (e: any) => {
        if (!res.headersSent) {
            res.status(502).send(`browser proxy: ${e?.message ?? e}`);
        }
    });

    // 有请求体就转发
    const m = (req.method || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') {
        proxy_req.end();
    } else {
        req.pipe(proxy_req);
    }
}
