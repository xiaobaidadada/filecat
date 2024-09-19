
// 实现复制功能
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