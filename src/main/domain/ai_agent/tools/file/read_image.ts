import {readFile} from "fs/promises";
import pathModule from "path";

import {ai_agent_params_type} from "../ai_agent.tools";
import type { Ai_agent_tool_ctx } from "../ai_agent.tools";

export const read_image_schema: ai_agent_params_type = {
    "type": "function",
    "function": {
        "name": "read_image",
        "description": "把本地文件当作图片读取，让模型直接看到图片内容（可用于分析截图、界面布局、报错信息、图表等）。只要是图片格式的文件都能读，不限于常见后缀。如果文件内容本身就是 data:image/xxx;base64,... 形式的文本，也会被识别为图片。注意：只有当前模型开启了 support_image 才真正能看到图片。",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "图片文件路径（也支持直接传 data:image/xxx;base64,xxx 形式的图片文本）"
                }
            },
            "required": ["path"]
        }
    }
}

/** data URL 形如 data:image/png;base64,xxxx */
const data_url_re = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/;

/**
 * 按文件内容（魔数）识别图片类型。
 *
 * 不看扩展名：后缀可以被随意改名，而内容不会骗人。
 * 返回 null 表示不是能识别的图片格式。
 */
function sniff_image_mime(buffer: Buffer): string | null {
    if (buffer.length < 12) {
        return null;
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return "image/png";
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }
    // GIF: "GIF87a" / "GIF89a"
    if (buffer.subarray(0, 3).toString("ascii") === "GIF") {
        return "image/gif";
    }
    // WEBP: "RIFF" .... "WEBP"
    if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
        return "image/webp";
    }
    // BMP: "BM"
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
        return "image/bmp";
    }
    // ICO: 00 00 01 00
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
        return "image/x-icon";
    }
    // TIFF: "II*\0" (little endian) / "MM\0*" (big endian)
    const head4 = buffer.subarray(0, 4).toString("binary");
    if (head4 === "II*\u0000" || head4 === "MM\u0000*") {
        return "image/tiff";
    }
    // AVIF / HEIC 等基于 ISO BMFF：第 5~8 字节是 "ftyp"，后面跟品牌
    if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
        const brand = buffer.subarray(8, 12).toString("ascii");
        if (brand.startsWith("avif") || brand.startsWith("avis")) {
            return "image/avif";
        }
        if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("mif1")) {
            return "image/heic";
        }
    }
    return null;
}

/**
 * 工具返回值中标记图片的结构。
 *
 * 这里不直接拼成 OpenAI 的消息片段，而是交给 chat.core 决定怎么用 ——
 * chat.core 需要根据「当前模型是否开启 support_image」来降级为纯文本说明。
 */
export interface image_tool_result {
    /** 固定标记，chat.core 靠它识别这是图片结果 */
    __image__: true;
    /** 图片的 data url，可直接用于 OpenAI 的 image_url.url */
    data_url: string;
    /** 给模型的文字说明 */
    text: string;
    /** 来源文件路径（data url 文本输入时为空） */
    path?: string;
    /** 图片字节数（data url 文本输入时为 base64 长度） */
    size: number;
}

/**
 * 读取本地图片（或 data url 文本）并转成可供模型消费的结果。
 *
 * 两种输入：
 *   1. 文件路径                   → 读文件，按内容魔数判断类型，转 base64
 *   2. data:image/...;base64, 文本 → 直接透传
 */
export const read_image_tool = async (
    ctx: Ai_agent_tool_ctx,
    { path }: { path: string },
): Promise<image_tool_result | string> => {
    const input = (path ?? "").trim();
    if (!input) {
        return "错误: path 不能为空";
    }

    // 情况 2：直接传的就是 data url 文本
    const matched = input.match(data_url_re);
    if (matched) {
        const [, mime, base64] = matched;
        return {
            __image__: true,
            data_url: `data:${mime};base64,${base64}`,
            text: `已读取图片（${mime}，base64 长度 ${base64.length}），请分析图片内容。`,
            size: base64.length,
        };
    }

    // 情况 1：文件路径 —— 类型一律由文件内容决定，不看扩展名
    let buffer: Buffer;
    try {
        buffer = await readFile(input);
    } catch (e: any) {
        return `错误: 读取文件失败 ${e?.message ?? e}`;
    }

    const mime = sniff_image_mime(buffer);
    if (!mime) {
        return `错误: "${pathModule.basename(input)}" 的内容不是可识别的图片格式（支持 PNG / JPEG / GIF / WEBP / BMP / ICO / TIFF / AVIF / HEIC）`;
    }

    return {
        __image__: true,
        data_url: `data:${mime};base64,${buffer.toString("base64")}`,
        text: `已读取图片 ${pathModule.basename(input)}（${mime}，${buffer.length} 字节），请分析图片内容。`,
        path: input,
        size: buffer.length,
    };
}

/** 判断一个工具返回值是否是图片结果 */
export function is_image_tool_result(v: any): v is image_tool_result {
    return v != null && typeof v === "object" && v.__image__ === true;
}
