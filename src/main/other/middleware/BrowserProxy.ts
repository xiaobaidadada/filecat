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
 *   3. 响应头改写 —— Set-Cookie 去 Domain、Location 重写回代理
 *
 * 服务端另有一层 Referer 兜底：站点用 location.origin 拼出的地址会丢失
 * 代理前缀（直接打到我们域名根路径），这类请求由 Referer 还原目标站后转发。
 *
 * 代理范围（重要取舍）：
 *   只代理「目标站自身 + 同主域子域」（如 gitee.com 与 cn-assets.gitee.com）。
 *   真正跨主域的地址保持原样，点击会跳出代理 —— 因为跨域请求即使改写了
 *   也仍会被浏览器同源策略拦截，且所有网站共用同一代理域会导致 cookie 互相覆盖。
 *
 * 其他取舍：
 *   · 请求时强制 Accept-Encoding: identity，逼目标站返回明文，省去解压再压缩
 *   · 用 iconv-lite 按 charset 解码，兼容 GBK 等中文站点
 */
import {NextFunction, Request, Response} from 'express';
import http from 'http';
import https from 'https';
import iconv from 'iconv-lite';
import {URL} from 'url';
import {UserAuth} from '../../../common/req/user.req';
import {userService} from '../../domain/user/user.service';

/** 代理路径前缀（相对 base_url） */
export const PROXY_PATH = '/browser_proxy';

/**
 * token 在代理路径中的固定段位（0 起）：
 *   /browser_proxy/{token}/{proto}/{host}/path
 *
 * 为什么把 token 放路径而不是 query：
 *   iframe 内的请求由浏览器原生发起，带不上 Authorization 头。
 *   放路径段后，<base> 天然覆盖所有相对路径解析，无需额外给每个 URL 补参数，
 *   三层机制（base / HTML 重写 / hook）都不必关心鉴权。
 */
const REQUEST_TIMEOUT = 30000;

/** 注入脚本的 <script> id，用于判断是否已注入过 */
const INJECT_ID = '__filecat_webvpn__';

/** 静态资源扩展名（用于 sec-fetch-dest 缺失时判断） */
const ASSET_EXT_RE = /\.(js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|json|map|txt|xml)(\?|$)/i;

/** 可能承载 JS 内容、但上游常标成 text/html 的扩展名（老式管理页常见） */
const ASSET_SCRIPT_RE = /\.(js|mjs|asp|aspx|cgi|php|do)(\?|$)/i;

/**
 * 兜底：转发「丢失代理前缀」的静态资源请求。
 *
 * 场景：站点用 location.origin 拼动态资源地址（如 /rp/x.js），
 * 代理下 origin 变成我们的域名，于是请求打到 http://我们的域/rp/x.js，
 * 丢失了 /browser_proxy/{token}/{proto}/{host} 前缀而 404。
 * 注入脚本本应改写这类地址，但站点的加载器可能跑在 Worker 等
 * hook 覆盖不到的环境，所以再做一层服务端兜底。
 *
 * 判定条件严格限定，避免误伤正常请求：
 *   · 请求的是静态资源（sec-fetch-dest 为 script/style/image/font）
 *   · Referer 指向本站的代理页（能从中还原目标站）
 *   · 只处理 GET/HEAD，且路径不以 sys_pre 开头（不碰我们自己的接口）
 *
 * @returns 是否已接管响应
 */
function try_fallback_by_referer(req: Request, res: Response, sys_pre: string): boolean {
    const method = String(req.method || '').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
        return false;
    }
    const raw_url = req.originalUrl || req.url || '';
    if (sys_pre && raw_url.startsWith(sys_pre)) {
        return false;
    }
    // 只兜底「非文档类」请求，避免接管页面本身。
    // · document/iframe：浏览器地址栏或 iframe 加载的页面，属于正常导航，不接管
    // · empty：fetch / XHR / 动态 script，正是漏网资源的主要来源，必须放行
    // · 无该头（部分环境不带）：退化为按扩展名判断，非静态资源一律不碰
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
    return {
        token: decodeURIComponent(parts[0]),
        proto: parts[1],
        host: decodeURIComponent(parts[2]),
    };
}

/** 不向上游转发的请求头（影响响应形态或会造成回环） */
const STRIP_REQ_HEADERS = new Set([
    'host', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding',
    'upgrade', 'accept-encoding', 'content-length', 'referer', 'origin',
]);

/** 不向浏览器回传的响应头（安全策略类会拦住 iframe，编码/长度类由我们自己控制） */
const STRIP_RES_HEADERS = new Set([
    'content-security-policy', 'content-security-policy-report-only',
    'x-frame-options', 'content-encoding', 'content-length',
    'strict-transport-security', 'clear-site-data',
    'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy',
    // 逐跳头：描述的是「本跳」的传输编码，body 由我们重写，绝不能透传
    // 透传后会和 Node 自动补的 Content-Length 冲突（Content-Length can't be present with Transfer-Encoding）
    'transfer-encoding', 'connection', 'keep-alive', 'trailer', 'upgrade',
]);

/**
 * 把 HTML 里的 URL 属性统一改写成代理地址。
 *
 * 核心：所有相对地址都在「目标站视角」下先 resolve 成绝对地址，再套代理前缀。
 * 这一步必须在服务端做，因为 <base> 解决不了 ".." ：
 *   base = /browser_proxy/{token}/http/192.168.1.1/
 *   "../../resource/a.js" 会退穿代理前缀变成 /browser_proxy/{token}/resource/a.js，
 *   而正确结果应是 /browser_proxy/{token}/http/192.168.1.1/resource/a.js。
 * 所以这里不依赖 <base> 处理相对路径，全部显式改写。
 *
 * 实现要点：必须「先取标签、再取属性」。
 * 若直接全局扫 href=xxx，会把 JS 代码里的 `window.location.href = url`
 * 当成属性改写，破坏脚本（实测华为路由器 loginInner.asp 就踩了这个坑）。
 *
 * 只改写目标站自身的地址；跨站 / data: / #锚点 / 特殊协议保持原样。
 */
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

/**
 * 重写 CSS 里的 url(...) 与 @import。
 * 只在 <style> 块与 style="..." 属性内处理 —— 不能全局扫 `url(`，
 * 否则 JS 里的同名文本（如 `var u = "url(x)"`）会被误改。
 * 外部 CSS 文件里的 url() 不用管：它们相对 CSS 文件自身解析，天然正确。
 */
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
    // 目标站自身或其同主域资源（CDN 常部署在子域，如 cn-assets.gitee.com）才改写
    if (!is_same_site_host(abs.host, target.host)) {
        return null;
    }
    return `${prefix}${abs.pathname}${abs.search}${abs.hash}`;
}

/**
 * 判断两个 host 是否属于同一站点。
 * 现代站点普遍把静态资源放在 CDN 子域（cn-assets.gitee.com、static.zhihu.com），
 * 只代理主域会导致这些资源跨域加载被 CORS 拦截，页面脚本全废。
 * 这里放宽为「同主域」：域名相同，或互为父子域。
 */
function is_same_site_host(a: string, b: string): boolean {
    const norm = (h: string) => h.replace(/^www\./, '').toLowerCase();
    const ha = norm(a);
    const hb = norm(b);
    if (ha === hb) {
        return true;
    }
    // 互为子域时视为同站；主域至少两级（避免把 co.uk 这类当成同站）
    const root = (h: string) => {
        const parts = h.split('.');
        return parts.length <= 2 ? h : parts.slice(-2).join('.');
    };
    return root(ha) === root(hb);
}

/**
 * 注入到页面里的脚本。
 * 作用：把运行时拼出来的 URL 改写成代理地址，让站内跳转/请求继续留在代理下。
 */
function build_inject_script(prefix: string, page_url: URL): string {
    return `<script id="${INJECT_ID}">
(function(){
  if (window.__filecat_webvpn__) return;
  window.__filecat_webvpn__ = true;
  var PREFIX = ${JSON.stringify(prefix)};
  var PAGE = ${JSON.stringify(page_url.href)};
  var TARGET_HOST = ${JSON.stringify(page_url.host)};

  /**
   * 把任意地址转成代理地址；非目标站或不支持协议的返回原值。
   *
   * 要处理三类输入：
   *   ① 相对地址 / 目标站绝对地址 —— 按目标站视角解析（用 PAGE 作基准），
   *      不能用当前 iframe 的真实 URL，否则 "../x" 会退穿代理前缀。
   *   ② 站点用 location.origin 拼出的地址 —— 代理下 origin 变成了我们的域名，
   *      于是拼出 http://我们的域/rp/x.js（丢了 /browser_proxy/... 前缀）。
   *      这类要当「目标站的根相对路径」重新包装，否则 404。
   *   ③ 真正的跨站地址 —— 保持原样。
   */
  function wrap(u) {
    if (u == null) return u;
    u = String(u);
    if (!u) return u;
    if (/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(u)) return u;
    var abs;
    try { abs = new URL(u, PAGE); } catch(e) { return u; }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return u;

    // 已是完整合法的代理地址，原样返回。
    // 注意要校验「前缀后面确实跟着 proto/host 段」—— 站点用 location.href 拼
    // 相对路径时会得到 /browser_proxy/{token}/rp/x.js 这种残缺形式（少了 host 段），
    // 那类仍需要按目标站视角修正。
    if (is_valid_proxy_path(abs.pathname)) return u;

    // 目标站自身，或站点用错 origin 拼出的自身地址，都重新包装
    if (is_target_host(abs.host) || abs.host === location.host) {
      return PREFIX + abs.pathname + abs.search + abs.hash;
    }
    // 跨站，保持原样
    return u;
  }

  /** 判断路径是否为完整的代理路径（前缀 + proto + host 三段齐全） */
  function is_valid_proxy_path(pathname) {
    if (pathname.indexOf(PREFIX + '/') !== 0) return false;
    var rest = pathname.slice(PREFIX.length + 1);
    var first = rest.indexOf('/');
    if (first === -1) return false;
    var second = rest.indexOf('/', first + 1);
    return second > first + 1;
  }

  /** 取注册主域（末两段），用于判断是否同站 */
  function root_domain(h) {
    var parts = String(h).replace(/^www\\./, '').toLowerCase().split('.');
    return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.');
  }

  /**
   * 判断是否属于目标站（含同主域的 CDN 子域）。
   * 站点常把静态资源放在 cn-assets.xxx.com / static.xxx.com 这类子域，
   * 只认主域会导致这些资源跨域加载失败，页面脚本全废。
   */
  function is_target_host(host) {
    var clean = function(h) { return String(h).replace(/^www\\./, '').toLowerCase(); };
    if (clean(host) === clean(TARGET_HOST)) return true;
    return root_domain(host) === root_domain(TARGET_HOST);
  }
  // 暴露出去，站内脚本/调试可以用
  window.__filecat_wrap__ = wrap;

  // ---------- 1. fetch ----------
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

  // ---------- 2. XMLHttpRequest ----------
  var rawOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = wrap(url);
    return rawOpen.apply(this, args);
  };

  // ---------- 3. WebSocket ----------
  var rawWS = window.WebSocket;
  if (rawWS) {
    window.WebSocket = function(url, protocols) {
      try { url = wrap(url).replace(/^http/, 'ws'); } catch(e) {}
      return protocols === undefined ? new rawWS(url) : new rawWS(url, protocols);
    };
    window.WebSocket.prototype = rawWS.prototype;
  }

  // ---------- 4. history（只改地址栏，不触发加载）----------
  ['pushState','replaceState'].forEach(function(fn){
    var raw = history[fn];
    if (!raw) return;
    history[fn] = function(state, title, url) {
      if (url != null) url = wrap(url);
      return raw.call(this, state, title, url);
    };
  });

  // ---------- 5. location 导航 ----------
  // location 对象只读，多数浏览器禁止整体重定义；只 hook assign/replace 函数
  try {
    var loc = window.location;
    var rawAssign = loc.assign.bind(loc);
    var rawReplace = loc.replace.bind(loc);
    loc.assign = function(u) { rawAssign(wrap(u)); };
    loc.replace = function(u) { rawReplace(wrap(u)); };
  } catch(e) {}

  // ---------- 6. 动态创建元素并赋值 src/href ----------
  // 站内常见写法：el = document.createElement('script'); el.src = '/a.js'; el.appendChild(el)
  // 这类赋值走 URL 属性解析，相对「当前页面地址」（含代理前缀），
  // 需要按目标站视角重新解析，避免 "../x" 退穿代理前缀。
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
  ['src', 'href'].forEach(function(prop){
    hook_url_props(HTMLScriptElement.prototype, prop);
    hook_url_props(HTMLLinkElement.prototype, prop);
    hook_url_props(HTMLImageElement.prototype, prop);
    hook_url_props(HTMLIFrameElement.prototype, prop);
    hook_url_props(HTMLSourceElement.prototype, prop);
    hook_url_props(HTMLMediaElement.prototype, prop);
  });

  // ---------- 7. setAttribute 兜底 ----------
  // 有些写法直接 el.setAttribute('src', '/a.js')，绕过上面的属性 setter
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

  // ---------- 8. 链接点击兜底 ----------
  // <base> 已能覆盖绝大多数情况；这里只处理「已经带完整域名」的绝对链接
  document.addEventListener('click', function(e){
    var el = e.target;
    while (el && el !== document) {
      if (el.tagName === 'A' && el.hasAttribute('href')) break;
      el = el.parentNode;
    }
    if (!el || el.tagName !== 'A') return;
    var href = el.getAttribute('href');
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) return;
    // 完整绝对地址（跨站链接）走代理
    if (/^https?:\\/\\//i.test(href) && href.indexOf(PREFIX) !== 0) {
      el.setAttribute('href', wrap(href));
    }
  }, true);

})();
</script>`;
}

/** MIME 是否为 HTML */
function is_html(content_type: string): boolean {
    return /text\/html|application\/xhtml\+xml/i.test(content_type);
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

/** 把「重定向地址」改写成代理地址 */
function rewrite_location(loc: string, base: URL, prefix: string): string {
    if (!loc || /^(data:|blob:|javascript:)/i.test(loc)) {
        return loc;
    }
    try {
        const u = new URL(loc, base);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return loc;
        }
        return `${prefix}/${u.host}${u.pathname}${u.search}${u.hash}`;
    } catch {
        return loc;
    }
}

/**
 * 去掉 Set-Cookie 的 Domain（否则域名不匹配会被浏览器丢弃），
 * 并把 Path 统一成 '/'，保证 cookie 在代理域下处处可见。
 */
function fix_set_cookie(raw: string): string {
    const parts = raw.split(';').filter(seg => !/^\s*domain\s*=/i.test(seg));
    let has_path = false;
    const out = parts.map(seg => {
        if (/^\s*path\s*=/i.test(seg)) {
            has_path = true;
            return ' Path=/';
        }
        return seg;
    });
    if (!has_path) {
        out.push(' Path=/');
    }
    return out.join(';');
}

/**
 * 构造网页代理中间件。
 * @param sys_pre API 前缀（如 '' 或 '/filecat'）
 */
export const use_browser_proxy_middleware = (sys_pre: string) => {
    const full_prefix = `${sys_pre}${PROXY_PATH}`;
    const marker = full_prefix + '/';

    return async (req: Request, res: Response, next: NextFunction) => {
        const raw_url = req.originalUrl || req.url || '';
        if (!raw_url.startsWith(marker)) {
            // 不是代理路径。
            // 但存在「漏网请求」：站点用 location.origin 拼出的动态资源地址
            // (如 http://我们的域/rp/x.js)，丢失了代理前缀，会 404。
            // 这类请求的 Referer 仍指向代理页，可据此还原出目标站并转发。
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
        const proto = first_slash === -1 ? after_token : after_token.slice(0, first_slash);
        const after_proto = first_slash === -1 ? '' : after_token.slice(first_slash + 1);
        const second_slash = after_proto.indexOf('/');
        const host = second_slash === -1 ? after_proto : after_proto.slice(0, second_slash);
        const rest_path = second_slash === -1 ? '/' : after_proto.slice(second_slash);

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

/**
 * 把浏览器发来的代理地址还原成目标站地址。
 * /browser_proxy/{token}/http/192.168.1.1/login.html → http://192.168.1.1/login.html
 * 还原失败时回退到目标站 origin。
 */
function restore_target_url(proxy_url: string, target: URL): string {
    const marker = `${PROXY_PATH}/`;
    const i = proxy_url.indexOf(marker);
    if (i === -1) {
        return `${target.origin}/`;
    }
    let rest = proxy_url.slice(i + marker.length);
    // 跳过 token 段
    const t_slash = rest.indexOf('/');
    if (t_slash === -1) {
        return `${target.origin}/`;
    }
    rest = rest.slice(t_slash + 1);
    // 跳过 proto/host 两段
    const first = rest.indexOf('/');
    if (first === -1) {
        return `${target.origin}/`;
    }
    rest = rest.slice(first + 1);
    const second = rest.indexOf('/');
    const path = second === -1 ? '/' : rest.slice(second);
    return `${target.origin}${path}`;
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
    // 强制明文，省去解压缩
    headers['accept-encoding'] = 'identity';

    // Referer / Origin 还原成目标站自身：很多站点（尤其路由器管理页）
    // 会校验它们，带代理地址会被判为跨站请求直接 403。
    // 做法是把代理前缀从浏览器发来的 referer 里剥掉，还原成目标站 URL，
    // 而不是粗暴地替换成 origin —— 后者会丢掉具体的页面路径。
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

    const proxy_req = agent.request(options, (proxy_res) => {
        const content_type = String(proxy_res.headers['content-type'] ?? '');
        const status = proxy_res.statusCode ?? 502;

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

        // Set-Cookie 处理（去 Domain、Path 归一）
        const set_cookie = proxy_res.headers['set-cookie'];
        if (set_cookie) {
            const arr = Array.isArray(set_cookie) ? set_cookie : [set_cookie];
            res.setHeader('set-cookie', arr.map(fix_set_cookie));
        }

        // 非 HTML：直接流式回传（长度交给 Node 分块，不用上游的 content-length）
        if (!is_html(content_type)) {
            res.status(status);
            if (!res.getHeader('content-type') && content_type) {
                res.setHeader('content-type', content_type);
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

        // ① 浏览器要的是 script/style，但上游返回 HTML —— 上游把错误页当资源返回了。
        //    直接回给浏览器会报 "Unexpected token '<'" 并污染全局，返回空内容更安全。
        if ((want === 'script' || want === 'style') && status >= 400) {
            res.status(200);
            res.setHeader('content-type', want === 'style' ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
            res.setHeader('content-length', '0');
            res.end();
            return;
        }

        // ② 老式脚本接口：路径以 .js/.asp/.aspx/.cgi 结尾，但上游标成了 text/html。
        //    这类文件实际内容是 JS（路由器管理页常见，如 loginInner.asp），
        //    同源加载时浏览器会因 MIME 不符拒绝执行，需要纠正 content-type。
        if (want === 'script' && ASSET_SCRIPT_RE.test(req.path || '')) {
            res.status(status);
            res.setHeader('content-type', 'application/javascript; charset=utf-8');
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
                let html = iconv.decode(Buffer.concat(chunks), charset);

                // ① 重写所有 URL 属性（相对/../、根相对、同站绝对）
                //    必须做：<base> 解决不了 "../"，会退穿代理前缀落到错误位置
                html = rewrite_urls(html, prefix, target_url);
                html = rewrite_css_urls(html, prefix, target_url);
                html = rewrite_meta_refresh(html, prefix, target_url);

                // ② 注入 hook 脚本：处理运行时动态拼出的地址
                const script = build_inject_script(prefix, target_url);
                const inject = script;

                if (/<head[^>]*>/i.test(html)) {
                    html = html.replace(/<head[^>]*>/i, (m) => m + inject);
                } else if (/<html[^>]*>/i.test(html)) {
                    html = html.replace(/<html[^>]*>/i, (m) => m + inject);
                } else {
                    html = inject + html;
                }

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
