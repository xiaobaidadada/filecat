// 实现复制功能
import {themes} from "../../../common/req/user.req";

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
    const href = `${theme}.css`; // 确保文件在 public 目录

    // 创建新的 link
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}
