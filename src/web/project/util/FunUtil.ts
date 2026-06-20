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

export function setTheme(theme: themes) {

    const id = 'theme-css';

    // 检查是否已存在 link 标签
    const existing = document.getElementById(id);
    if (existing) {
        existing.remove(); // ✅ 移除旧的 link（移除样式）
    }
    if (theme === "light" || !theme) {
        return;
    }

    let href: string;
    if (builtin_theme_values.has(theme)) {
        // 内置主题：CSS 文件在 dist 目录下
        href = `${theme}.css`;
    } else {
        // 插件主题：通过 API 代理获取 CSS
        href = `${Global.base_url}/api/setting/plugin/theme?theme_id=${encodeURIComponent(theme)}`;
    }

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