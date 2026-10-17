import {loadWorkbook, workbookToBytes} from "@office-kit/xlsx/io";

/** 单元格显示样式 */
export interface CellStyle {
    /** 背景色，形如 #D9D9D9 */
    bg?: string;
    /** 字体色 */
    color?: string;
    bold?: boolean;
    italic?: boolean;
    /** 字号，单位 pt（原样保留，渲染时换算成 px） */
    fontSize?: number;
    /** 字体名 */
    fontFamily?: string;
    /** 下划线 */
    underline?: boolean;
    /** 删除线 */
    strike?: boolean;
    align?: "left" | "center" | "right";
    valign?: "top" | "middle" | "bottom";
    /** 是否换行 */
    wrap?: boolean;
    /** 左缩进级数，1 级约 3 个字符宽 */
    indent?: number;
    /** 边框（存在即画） */
    border?: {left?: boolean; right?: boolean; top?: boolean; bottom?: boolean};
    /** 富文本分段（存在时按段渲染颜色） */
    runs?: RichRun[];
}

/** 一个工作表在网格里的呈现 */
export interface SheetView {
    title: string;
    /** 二维值，null 表示空 */
    values: (string | null)[][];
    /** 按 "行_列"（0 基）索引的样式 */
    styles: Map<string, CellStyle>;
    /** 列宽（px），下标 0 基 */
    col_widths: number[];
    /** 行高（px），下标 0 基 */
    row_heights: number[];
    /** 隐藏的行下标 */
    hidden_rows: Set<number>;
    /** 1 基的合并区域 [r1,c1,r2,c2] */
    merges: [number, number, number, number][];
}

/** Excel 列宽单位转像素（ECMA-376 的通用换算式） */
const col_w_to_px = (w: number) => Math.round(w * 7 + 5);
/** 行高单位是磅，1pt = 4/3 px */
const row_h_to_px = (h: number) => Math.round((h * 4) / 3);

/** 把内存字节包成库需要的 source（避免依赖 node:fs） */
function bytes_source(bytes: Uint8Array) {
    return {toBytes: async () => bytes};
}

/** 解析主题色板：theme 索引 → RGB */
function parse_theme(xml: any): string[] {
    // ECMA-376 主题索引顺序：lt1 dk1 lt2 dk2 accent1..6
    const fallback = ["FFFFFF", "000000", "EEECE1", "1F497D", "4F81BD", "C0504D", "9BBB59", "8064A2", "4BACC6", "F79646"];
    if (!xml) {
        return fallback;
    }
    const text = typeof xml === "string" ? xml : new TextDecoder().decode(xml);
    const block = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(text)?.[0];
    if (!block) {
        return fallback;
    }
    const out: string[] = [];
    const re = /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>([\s\S]*?)<\/a:\1>/g;
    const order = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
    const found = new Map<string, string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
        const hex = /(?:lastClr|val)="([0-9A-Fa-f]{6})"/.exec(m[2])?.[1];
        if (hex) {
            found.set(m[1], hex.toUpperCase());
        }
    }
    order.forEach((k, i) => out[i] = found.get(k) ?? fallback[i]);
    return out;
}

/** 按 tint 明暗调整颜色（ECMA-376 规范算法） */
function apply_tint(hex: string, tint: number): string {
    if (!tint) {
        return hex;
    }
    const n = parseInt(hex, 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return ch
        .map((c) => {
            const v = tint < 0 ? c * (1 + tint) : c * (1 - tint) + 255 * tint;
            return Math.round(v).toString(16).padStart(2, "0");
        })
        .join("")
        .toUpperCase();
}

/** 颜色对象转 #RRGGBB */
function color_hex(c: any, theme: string[]): string | undefined {
    if (!c) {
        return undefined;
    }
    if (c.rgb) {
        const rgb = String(c.rgb);
        return "#" + (rgb.length === 8 ? rgb.slice(2) : rgb);
    }
    if (c.theme !== undefined && theme[c.theme]) {
        return "#" + apply_tint(theme[c.theme], c.tint ?? 0);
    }
    return undefined;
}

/** 富文本 run */
export interface RichRun {
    text: string;
    color?: string;
}

/** Excel 日期序列号转 Date（1900 系统，含 1900 闰年 bug 补偿） */
function serial_to_date(serial: number): Date {
    const ms = Math.round((serial - 25569) * 86400000);
    return new Date(ms);
}

/** 日期格式串转显示文本，覆盖常见的 m/d/yy、yyyy/m/d、yyyy"年"m"月" 等写法 */
function format_date(d: Date, fmt: string): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    const y4 = d.getUTCFullYear();
    const y2 = y4 % 100;
    const mo = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const week = "日一二三四五六"[d.getUTCDay()];
    return fmt
        .replace(/;.*$/, "") // 去掉后半段（负数/零值格式）
        .replace(/\[[^\]]*\]/g, "") // 去掉 [DBNum1][$-804] 之类的修饰
        .replace(/"[^"]*"/g, (m) => m.slice(1, -1))
        .replace(/\\/g, "")
        .replace(/yyyy/g, String(y4))
        .replace(/yy/g, pad(y2))
        .replace(/(?<!m)m(?!m)/g, String(mo))
        .replace(/mm/g, pad(mo))
        .replace(/d(?!d)/g, String(day))
        .replace(/dd/g, pad(day))
        .replace(/aaaa/g, `星期${week}`);
}

/** 判断某个格式串是否是日期格式 */
const is_date_fmt = (fmt?: string) => !!fmt && /[ymd]/i.test(fmt.replace(/"[^"]*"/g, "")) && !/[#0]/.test(fmt.replace(/"[^"]*"/g, ""));

/** 单元格值转显示文本；富文本额外返回分段，用于保留局部颜色 */
function format_cell(cell: any, theme: string[], fmt?: string): {text: string | null; runs?: RichRun[]} {
    const v = cell?.value;
    if (v === undefined || v === null) {
        return {text: null};
    }
    if (typeof v === "object") {
        // 富文本：拼接所有 run，同时保留每个 run 的颜色
        if (Array.isArray(v.runs)) {
            const runs: RichRun[] = v.runs.map((r: any) => ({text: r.text ?? "", color: color_hex(r.font?.color, theme)}));
            const text = runs.map((r) => r.text).join("");
            // 只有存在局部颜色时才需要分段渲染
            const colored = runs.some((r) => r.color);
            return {text: text || null, runs: colored ? runs : undefined};
        }
        if (typeof v.text === "string") {
            return {text: v.text};
        }
        // 公式取缓存结果，日期格式的按日期显示
        const cached = v.cachedValue ?? v.result;
        if (cached !== undefined) {
            if (typeof cached === "number" && is_date_fmt(fmt)) {
                return {text: format_date(serial_to_date(cached), fmt!)};
            }
            return {text: String(cached)};
        }
        return {text: null};
    }
    if (typeof v === "number" && is_date_fmt(fmt)) {
        return {text: format_date(serial_to_date(v), fmt!)};
    }
    return {text: String(v)};
}

/** 从 cellXfs 解析出 CSS 样式 */
function cell_style(cell: any, styles: any, theme: string[]): CellStyle | undefined {
    const style_id = cell?.styleId;
    if (style_id === undefined) {
        return undefined;
    }
    const xf = styles.cellXfs?.[style_id];
    if (!xf) {
        return undefined;
    }
    const fill = styles.fills?.[xf.fillId];
    const font = styles.fonts?.[xf.fontId];
    const out: CellStyle = {};
    if (fill?.patternType === "solid") {
        out.bg = color_hex(fill.fgColor, theme);
    }
    out.color = color_hex(font?.color, theme);
    if (font?.bold) {
        out.bold = true;
    }
    if (font?.italic) {
        out.italic = true;
    }
    if (font?.size) {
        out.fontSize = font.size;
    }
    if (font?.name) {
        out.fontFamily = font.name;
    }
    if (font?.underline) {
        out.underline = true;
    }
    if (font?.strike) {
        out.strike = true;
    }
    const al = xf.alignment;
    if (al?.horizontal && ["left", "center", "right"].includes(al.horizontal)) {
        out.align = al.horizontal;
    }
    if (al?.vertical) {
        out.valign = al.vertical === "center" ? "middle" : al.vertical;
    }
    if (al?.wrapText) {
        out.wrap = true;
    }
    if (al?.indent) {
        out.indent = al.indent;
    }
    return Object.keys(out).length ? out : undefined;
}

/** 取单元格的数字格式串（numFmtId 内置 14-22 是日期，自定义的查 numFmts） */
function cell_num_fmt(cell: any, styles: any): string | undefined {
    const style_id = cell?.styleId;
    if (style_id === undefined) {
        return undefined;
    }
    const xf = styles.cellXfs?.[style_id];
    if (!xf) {
        return undefined;
    }
    const id = xf.numFmtId;
    if (id === undefined || id === 0) {
        return undefined;
    }
    // 内置格式表：14-22 常规日期时间，27-36 / 50-58 是亚洲区日期格式
    const builtin: Record<number, string> = {
        14: "m/d/yy",
        15: "d-mmm-yy",
        16: "d-mmm",
        17: "mmm-yy",
        18: "h:mm AM/PM",
        19: "h:mm:ss AM/PM",
        20: "h:mm",
        21: "h:mm:ss",
        22: "m/d/yy h:mm",
        27: 'yyyy"年"m"月"',
        28: 'm"月"d"日"',
        29: 'm"月"d"日"',
        30: "m-d-yy",
        31: 'yyyy"年"m"月"d"日"',
        32: 'h"时"mm"分"',
        33: 'h"时"mm"分"ss"秒"',
        34: '上午/下午h"时"mm"分"',
        35: '上午/下午h"时"mm"分"ss"秒"',
        36: 'yyyy"年"m"月"',
    };
    if (builtin[id]) {
        return builtin[id];
    }
    const fmts = styles.numFmts;
    if (fmts instanceof Map) {
        return fmts.get(id);
    }
    return undefined;
}

/** 从 xlsx 字节解析出所有工作表 */
export async function parse_xlsx(bytes: Uint8Array): Promise<SheetView[]> {
    const wb = await loadWorkbook(bytes_source(bytes));
    const theme = parse_theme((wb as any).themeXml);
    return wb.sheets.map((entry) => {
        const ws: any = entry.sheet;
        const styles = wb.styles as any;
        let max_r = 0;
        let max_c = 0;
        // rows / 列都是 1 基的稀疏 Map
        ws.rows.forEach((cols: Map<number, any>, r: number) => {
            if (!cols.size) {
                return;
            }
            max_r = Math.max(max_r, r);
            cols.forEach((_cell, c) => {
                max_c = Math.max(max_c, c);
            });
        });

        const values: (string | null)[][] = [];
        const cell_styles = new Map<string, CellStyle>();
        for (let r = 1; r <= max_r; r++) {
            const row: (string | null)[] = [];
            const cols = ws.rows.get(r);
            for (let c = 1; c <= max_c; c++) {
                const cell = cols?.get(c);
                const parsed = format_cell(cell, theme, cell_num_fmt(cell, styles));
                row.push(parsed.text);
                const st = cell_style(cell, styles, theme);
                if (parsed.runs) {
                    // 富文本的局部颜色优先于单元格整体字体色
                    if (st) {
                        st.runs = parsed.runs;
                    } else {
                        cell_styles.set(`${r - 1}_${c - 1}`, {runs: parsed.runs});
                    }
                }
                if (st) {
                    cell_styles.set(`${r - 1}_${c - 1}`, st);
                }
            }
            values.push(row);
        }

        // 列宽：未定义的列用默认宽度
        const default_w = col_w_to_px(ws.defaultColumnWidth ?? 8.43);
        const col_widths: number[] = new Array(max_c).fill(default_w);
        ws.columnDimensions?.forEach((dim: any) => {
            const px = col_w_to_px(dim.width ?? 8.43);
            for (let c = dim.min; c <= dim.max; c++) {
                if (c - 1 < col_widths.length) {
                    col_widths[c - 1] = px;
                }
            }
        });

        // 行高：未定义的用默认高度
        const default_h = row_h_to_px(ws.defaultRowHeight ?? 15);
        const row_heights: number[] = new Array(max_r).fill(default_h);
        const hidden_rows = new Set<number>();
        ws.rowDimensions?.forEach((dim: any, r: number) => {
            if (r - 1 < row_heights.length && dim.height) {
                row_heights[r - 1] = row_h_to_px(dim.height);
            }
            if (dim.hidden && r - 1 < max_r) {
                hidden_rows.add(r - 1);
            }
        });

        const merges: [number, number, number, number][] = (ws.mergedCells ?? []).map((m: any) => [
            (m.minRow ?? m.start?.row ?? 1) - 1,
            (m.minCol ?? m.start?.col ?? 1) - 1,
            (m.maxRow ?? m.end?.row ?? 1) - 1,
            (m.maxCol ?? m.end?.col ?? 1) - 1,
        ]);

        return {title: ws.title, values, styles: cell_styles, col_widths, row_heights, hidden_rows, merges};
    });
}

/**
 * 把网格数据写回 xlsx 字节。
 * 复用原工作簿对象，只改 value，样式/条件格式/合并等部件原样保留。
 */
export async function write_xlsx(bytes: Uint8Array, sheets: SheetView[]): Promise<Uint8Array> {
    const wb = await loadWorkbook(bytes_source(bytes));
    sheets.forEach((sheet, i) => {
        const entry = wb.sheets[i];
        if (!entry) {
            return;
        }
        const ws: any = entry.sheet;
        sheet.values.forEach((row, r) => {
            row.forEach((v, c) => {
                const r1 = r + 1;
                const c1 = c + 1;
                let cols = ws.rows.get(r1);
                if (!cols) {
                    cols = new Map();
                    ws.rows.set(r1, cols);
                }
                const cell = cols.get(c1);
                if (v === null || v === "") {
                    // 只清 value，保留单元格上的样式引用
                    if (cell) {
                        cell.value = null;
                    }
                    return;
                }
                if (cell) {
                    cell.value = v;
                } else {
                    cols.set(c1, {row: r1, col: c1, value: v});
                }
            });
        });
    });
    return await workbookToBytes(wb);
}
