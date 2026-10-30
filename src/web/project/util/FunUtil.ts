// 实现复制功能
import {themes, themes_list} from "../../../common/req/user.req";
import {Global} from "../util/global";

/**
 * 复制文本到剪贴板，返回是否成功。
 *
 * 不使用 navigator.clipboard：它只在安全上下文（https 或 localhost）可用，
 * filecat 常被通过 http + 内网 IP 访问，那种情况下 navigator.clipboard 是
 * undefined，调用会直接抛错。所以统一用 textarea + execCommand 兜底。
 */
export function copyToClipboard(text: string | number | null | undefined): boolean {
    const str = text == null ? "" : String(text);
    if (!str) {
        return false;
    }

    const textArea = document.createElement('textarea');
    textArea.value = str;

    // 固定定位到视口外，避免页面滚动；同时保持可聚焦
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', 'readonly');

    document.body.appendChild(textArea);

    // 记录原焦点，复制后还原，避免打断用户正在编辑的输入框
    const active = document.activeElement as HTMLElement | null;

    textArea.select();
    textArea.setSelectionRange(0, str.length); // 移动设备需要显式设置范围

    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (e) {
        ok = false;
    }

    document.body.removeChild(textArea);
    active?.focus?.();

    return ok;
}

// 内置主题列表的 value 集合，用于判断是否为内置主题
const builtin_theme_values = new Set(themes_list.map(t => t.value));

// 全局默认主题：用户未设置主题时的回落值，需与后端 setting.service 的 DEFAULT_THEME 保持一致
const DEFAULT_THEME = 'google';

export function setTheme(theme: themes) {

    const id = 'theme-css';

    const existing = document.getElementById(id) as HTMLLinkElement | null;

    // light 是 base.css 里的默认样式，没有独立文件：移除 link 即回落到默认外观
    if (theme === "light") {
        existing?.remove();
        return;
    }

    let href: string;
    if (!theme) {
        // 用户未设置主题：回落到全局默认主题
        href = `${DEFAULT_THEME}.css`;
    } else if (builtin_theme_values.has(theme)) {
        // 内置主题：CSS 文件在 dist 目录下
        href = `${theme}.css`;
    } else {
        // 插件主题：通过 API 代理获取 CSS
        href = `${Global.base_url}/api/setting/plugin/theme?theme_id=${encodeURIComponent(theme)}`;
    }

    // 服务端已渲染了相同主题的 link 时直接复用，
    // 换成「移除再新建」会让样式重新应用一次，表现为闪一下。
    if (existing && existing.getAttribute('href') === href) {
        return;
    }
    existing?.remove();

    // 创建新的 link
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}


export async function hashString(input, salt = '') {
    // 使用 TextEncoder 将字符串转换为字节数组
    const encoder = new TextEncoder();
    const data = encoder.encode(`${input}${salt ?? ''}`);  // 合并输入字符串和盐

    // 使用 Web Crypto API 计算 SHA-256 哈希值
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // 将结果转化为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}


export const get_select_style = (select:boolean)=> {
   return {
       color: select?"var(--blue)":undefined,
       fontWeight: select?"bold":undefined,
   }
}
