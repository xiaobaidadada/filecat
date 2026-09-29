import {settingHttp} from "../../../../util/config";
import {RCode} from "../../../../../../common/Result.pojo";
import {md_theme_item} from "../../../../../../common/req/common.pojo";

/**
 * md 编辑器主题的前端工具。
 *
 * 主题 css 原样注入，不做任何选择器改写：主题里写什么，浏览器就用什么。
 * 正文容器的类名是 .md-editor-sheet，编辑器与主题预览用的是同一个类名，
 * 所以主题只需针对它书写选择器（如 .md-editor-sheet h1），一处书写两处生效。
 */

// 主题 <style> 元素的 id 前缀：每种容器各保留一份（编辑器 / 预览器），互不覆盖
const STYLE_ID_PREFIX = "md-theme-style-";

/**
 * 把主题 css 注入页面。同一种容器只保留一份主题样式。
 * css 为空表示没有可用主题，此时不写 style，并把已有的那份移除（避免残留上一个主题）。
 * @param key 容器标识（用作 style 元素 id 后缀），不同容器互不覆盖
 * @param css 主题原始 css
 */
export function apply_theme_css(key: string, css: string) {
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
    el.textContent = css;
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

// 主题内容被增删改后调用：广播通知，已挂载的编辑器收到后重拉主题并重新注入。
export const MD_THEME_CHANGE_EVENT = "md-theme-change";

export function notify_md_theme_changed() {
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
// 没有可用主题时返回空串。结果由调用方写进 $stroe.md_theme_css，这里不做缓存。
export async function load_active_theme_css(): Promise<string> {
    try {
        const rsq = await settingHttp.get("md_theme/active");
        return rsq?.code === RCode.Success ? (rsq.data ?? "") : "";
    } catch (e) {
        return "";
    }
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
