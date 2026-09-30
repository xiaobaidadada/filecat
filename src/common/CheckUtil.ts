/**
 * 通用校验器集合。
 *
 * 按「数据类型」定义，各业务字段按需引用，不针对某个字段单独写校验。
 * 统一约定：入参是任意原始值，返回校验并归一化后的值；
 * 返回 null 表示非法，由调用方决定回落成什么（默认值 / 当前值）。
 */

// 带单位的 CSS 尺寸，如 "1400px"、"80%"、"40rem"
const SIZE_RE = /^(\d+(?:\.\d+)?)(px|%|rem|em|vw|vh|ch)$/;
// 纯数字（无单位），行高这类倍数用，如 "1.8"
const NUM_RE = /^\d+(\.\d+)?$/;
// 非负整数，如 "5"、"0"
const UINT_RE = /^\d+$/;
// 文件名不允许出现的字符：路径分隔符、windows 非法字符、控制字符
const BAD_FILENAME_RE = /[\\/:*?"<>|\u0000-\u001f]/;
// 文件名长度上限
const FILENAME_MAX_LENGTH = 64;

export const CheckUtil = {
    /**
     * CSS 尺寸值，如 "1400px"、"80%"、"40rem"、"1.8"
     * @param allow_unitless 允许纯数字（行高这类倍数）
     */
    size(raw: any, allow_unitless = false): string | null {
        const s = String(raw ?? "").trim();
        if (!s) {
            return null;
        }
        let num_str: string;
        if (allow_unitless && NUM_RE.test(s)) {
            num_str = s;
        } else {
            const m = SIZE_RE.exec(s);
            if (!m) {
                return null;
            }
            num_str = m[1];
        }
        const num = Number(num_str);
        // 上限只是防呆，避免极端值把界面撑坏
        return Number.isFinite(num) && num > 0 && num <= 10000 ? s : null;
    },

    /** 非负整数（秒数、数量等），入参可以是数字或纯数字字符串 */
    uint(raw: any): number | null {
        const s = String(raw ?? "").trim();
        return UINT_RE.test(s) ? Number(s) : null;
    },

    /**
     * 文件名（会被当路径段用，如 <名字>.css）。
     * 挡住路径穿越和非法字符；空串视为合法（表示「不使用」，由调用方决定语义）。
     * @param allow_empty 是否允许空串
     */
    filename(raw: any, allow_empty = true): string | null {
        const s = String(raw ?? "").trim();
        if (s === "") {
            return allow_empty ? "" : null;
        }
        if (s === "." || s === ".." || BAD_FILENAME_RE.test(s)) {
            return null;
        }
        return s.length > FILENAME_MAX_LENGTH ? null : s;
    },
};
