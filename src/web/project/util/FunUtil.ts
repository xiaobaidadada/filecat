// 实现复制功能
import {themes, themes_list} from "../../../common/req/user.req";
import {Global} from "../util/global";

export function copyToClipboard(text) {
    // const textarea = document.createElement('textarea');
    // textarea.value = text;
    // document.body.appendChild(textarea);
    // textarea.select();
    // document.execCommand('copy');  // 执行复制命令
    // document.body.removeChild(textarea); // 复制完成后移除 textarea

    // 创建一个不可见的textarea元素
    const textArea = document.createElement('textarea');
    textArea.value = text;

    // 让textarea不可见
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';

    // 把textarea添加到DOM中
    document.body.appendChild(textArea);

    // 选中textarea中的文本
    textArea.select();
    textArea.setSelectionRange(0, 99999); // 对移动设备的支持

    document.execCommand('copy');
    // 移除textarea元素
    document.body.removeChild(textArea);
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
