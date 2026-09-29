import {settingHttp} from "../../../../util/config";
import {RCode} from "../../../../../../common/Result.pojo";
import {md_theme_item} from "../../../../../../common/req/common.pojo";

/**
 * md 编辑器主题的前端工具。
 *
 * 主题按 Typora 的约定书写选择器（正文容器是 #write），
 * 这里在注入前把 #write 改写成实际的容器选择器，并按容器加作用域前缀，
 * 避免主题里的 html/body 等全局选择器污染整个后台界面。
 */

// 主题 <style> 元素的 id 前缀：每种容器各保留一份（编辑器 / 预览器），互不覆盖
const STYLE_ID_PREFIX = "md-theme-style-";

/**
 * 把 Typora 风格的 css 改写成作用域内的 css。
 *
 * 处理内容：
 * 1. 剥掉 Typora 专有指令（@include-when-export 等），浏览器不认，留着会整段失效
 * 2. 剥掉 @import：主题引用的相对路径文件在服务端并不存在
 * 3. #write / html / body / :root 统一替换成 scope，让主题的全局选择器只作用于容器
 * 4. 其余选择器统一加上 scope 前缀，保证样式不外泄
 *
 * @param css 主题原始 css
 * @param scope 容器选择器，如 "#md-editor-container .md-editor-sheet"
 */
export function scope_theme_css(css: string, scope: string): string {
    let out = String(css ?? "");

    // 先剥掉所有注释再改写。
    // 注释里可能含 { } #write 等字符，参与改写会被当成选择器的一部分，
    // 导致规则被破坏（例如出现 ".容器 /* 注释 */ #write {" 这种废规则）。
    // 注入的样式表不需要注释 —— 注释只在编辑区里给用户看。
    out = out.replace(/\/\*[\s\S]*?\*\//g, "");

    // 剥掉 Typora 专有指令整行（@include-when-export 是 Typora 自定义指令）
    out = out.replace(/^\s*@include-when-export[^;]*;?/gim, "");
    // 剥掉 @import：主题目录下的相对资源服务端不存在
    out = out.replace(/^\s*@import[^;]*;?/gim, "");

    // 逐条规则处理选择器
    return out.replace(/(^|})\s*([^{}@]+?)\s*\{/g, (m, prefix, selectors) => {
        const scoped = String(selectors)
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
            .map(sel => {
                // 主题的正文根选择器：直接换成容器本身
                if (sel === "#write" || sel === "html" || sel === "body" || sel === ":root" || sel === "content") {
                    return scope;
                }
                // #write 开头的选择器：把 #write 换成容器，保留后代的样式
                if (sel.startsWith("#write")) {
                    return scope + sel.slice("#write".length);
                }
                // html/body 开头的选择器：同样收敛到容器内
                if (/^(html|body)\b/.test(sel)) {
                    return scope + sel.replace(/^(html|body)/, "");
                }
                return `${scope} ${sel}`;
            })
            .join(", ");
        return `${prefix}\n${scoped} {`;
    });
}

/**
 * 把主题 css 注入页面。同一种容器只保留一份主题样式。
 * css 为空表示没有可用主题，此时不写 style，并把已有的那份移除（避免残留上一个主题）。
 * @param key 容器标识（用作 style 元素 id 后缀），不同容器互不覆盖
 * @param css 主题原始 css（Typora 风格）
 * @param scope 生效范围的容器选择器
 */
export function apply_theme_css(key: string, css: string, scope: string) {
    const style_id = STYLE_ID_PREFIX + key;
    const old = document.getElementById(style_id);
    if (!css) {
        old?.remove();
        return;
    }
    let el = old as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement("style");
        el.id = style_id;
        document.head.appendChild(el);
    }
    el.textContent = scope_theme_css(css, scope);
}

/**
 * 拉取当前用户该用的主题并注入到指定容器。
 * 用哪个主题由后端综合个人选择与系统设置决定，这里不传主题名。
 */
export async function apply_active_theme(key: string, scope: string) {
    const css = await load_active_theme_css();
    apply_theme_css(key, css, scope);
}

// ---- 与后端交互 ----

export async function load_md_theme_list(): Promise<md_theme_item[]> {
    try {
        const rsq = await settingHttp.get("md_theme/list");
        return rsq?.code === RCode.Success ? (rsq.data ?? []) : [];
    } catch (e) {
        return [];
    }
}

// 主题 css 的请求缓存。
// 编辑器与预览器会同时加载同一个主题，缓存 Promise 能让它们共用一次请求，
// 而不是各发一次（缓存结果的话，并发时两边都还没结果，照样发两次）。
// 主题内容会变，增删改后必须 invalidate_md_theme_css 清掉。
let active_theme_task: Promise<string> | null = null;

// 主题内容或选择变化后通知编辑器重新应用
export const MD_THEME_CHANGE_EVENT = "md-theme-change";

// 清掉 active 主题缓存。
// 缓存的是「当前该用哪个主题的 css」，所以只要用户选择变了、或主题内容本身变了，
// 都必须先清掉，否则会一直拿到上一个主题的样式。
export function invalidate_md_theme_css() {
    active_theme_task = null;
}

// 主题内容被增删改后调用：清缓存并通知已挂载的编辑器重新注入。
// 编辑器自己去清缓存的原因（用户切换主题）只调上面的 invalidate 就够了，
// 因为选中态变化本身会触发它的 effect。
export function notify_md_theme_changed() {
    invalidate_md_theme_css();
    window.dispatchEvent(new Event(MD_THEME_CHANGE_EVENT));
}

// 按 id 读取单个主题的 css 正文。
// 仅主题编辑页使用（要按名字取出内容来改），编辑器生效主题不走这里。
export async function load_md_theme_css(id: string): Promise<string> {
    try {
        const rsq = await settingHttp.get(`md_theme/get?id=${encodeURIComponent(id)}`);
        return rsq?.code === RCode.Success ? (rsq.data ?? "") : "";
    } catch (e) {
        return "";
    }
}

// 拉取当前用户实际该用的主题 css：主题名由后端算，前端不传也不关心。
// 没有可用主题时返回空串，调用方据此不注入样式。
export function load_active_theme_css(): Promise<string> {
    if (!active_theme_task) {
        active_theme_task = settingHttp.get("md_theme/active")
            .then(rsq => rsq?.code === RCode.Success ? (rsq.data ?? "") : "")
            .catch(() => "")
            // 请求失败不留在缓存里，否则失败结果会被一直复用
            .then(css => {
                if (!css) {
                    active_theme_task = null;
                }
                return css;
            });
    }
    return active_theme_task;
}

export async function save_md_theme(body: { id?: string, name: string, css: string }): Promise<md_theme_item | null> {
    const rsq = await settingHttp.post("md_theme/save", body);
    if (rsq?.code !== RCode.Success) {
        return null;
    }
    notify_md_theme_changed();
    return rsq.data;
}

export async function del_md_theme(id: string): Promise<boolean> {
    const rsq = await settingHttp.post("md_theme/del", {id});
    if (rsq?.code !== RCode.Success) {
        return false;
    }
    notify_md_theme_changed();
    return true;
}
