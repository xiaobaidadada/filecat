/**
 * 附件处理工具函数
 * 负责：文件类型判断、文件阅读、base64 转换、附件列表构建
 */
import { ai_agent_message_attachment_item } from "../../../../../common/req/filecat.ai.pojo";

/** 文件扩展名→文本类型映射：用于判断附件是文本/图片/二进制 */
const TEXT_LIKE_EXT = /\.(md|txt|json|js|jsx|ts|tsx|css|html?|xml|ya?ml|py|java|go|rs|c|cpp|h|hpp|sh|bat|cmd|ini|toml|csv|log|sql|env|gitignore|dockerfile)$/i;

/** 根据 MIME 类型和文件名猜测附件类型 */
export function guessAttachmentKind(file: File): "text" | "image" | "binary" {
    if (file.type?.startsWith("image/")) {
        return "image";
    }
    if (file.type?.startsWith("text/") || TEXT_LIKE_EXT.test(file.name)) {
        return "text";
    }
    return "binary";
}

/** 以文本方式读取文件内容 */
export function readFileAsText(file: File): Promise<string> {
    return file.text();
}

/** 将图片文件转为 base64 DataURL */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * 将待发送的 File 列表转换为后端需要的附件数组
 * - 文本文件：读取内容（超过 120000 字符截断）
 * - 图片文件：转为 base64
 * - 二进制文件：只记录文件名
 */
export async function buildAttachments(files: File[]): Promise<ai_agent_message_attachment_item[]> {
    const attachments: ai_agent_message_attachment_item[] = [];
    for (const file of files) {
        const kind = guessAttachmentKind(file);
        let content = "";
        if (kind === "text") {
            try {
                const text = await readFileAsText(file);
                const maxLen = 120000;
                content = text.length > maxLen
                    ? `${text.slice(0, maxLen)}\n\n[内容已截断，原始长度 ${text.length} 字符]`
                    : text;
            } catch {
                content = "[文本读取失败]";
            }
        } else if (kind === "image") {
            try {
                content = await fileToBase64(file);
            } catch {
                content = `[图片文件: ${file.name}]`;
            }
        } else {
            content = `[二进制文件: ${file.name}]`;
        }
        attachments.push({
            name: file.name,
            mime_type: file.type,
            size: file.size,
            kind,
            content
        });
    }
    return attachments;
}
