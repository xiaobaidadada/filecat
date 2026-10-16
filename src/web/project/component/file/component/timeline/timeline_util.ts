/**
 * 时间线编辑器（.timeline）的数据模型与工具函数。
 *
 * 文件内容是一份 JSON，顶层结构：
 * {
 *   version: 2,
 *   title: "标题",
 *   layout: { ... },     // 布局与外观配置（随文件持久化）
 *   phases: [ ... ]      // 阶段列表，每个阶段是轴向上的一段
 * }
 *
 * layout:
 * {
 *   direction: "vertical" | "horizontal",  // 纵向（上下）/ 横向（左右）
 *   node_style: "dot" | "circle" | "square" | "image",  // 节点样式
 *   card_style: "card" | "plain" | "bubble",            // 事件卡片样式
 *   line_style: "solid" | "dashed" | "dotted",          // 连线风格
 *   alternate: true,      // 事件是否两侧交替分布
 *   show_connector: true, // 是否显示节点到卡片的连线
 *   axis_color: "#1a73e8",// 主轴颜色
 * }
 *
 * phase:
 * { id, name, color, collapsed, head_visible, events }
 *
 * event:
 * {
 *   id, title, desc, date, color, image,
 *   side: "left" | "right",  // 逻辑侧：纵向=左右，横向=上下
 *   offset: 0~1,             // 在所属阶段内沿轴方向的相对位置
 * }
 */

/** 事件卡片的逻辑侧（纵向时表示左右，横向时渲染成上下） */
export type TimelineSide = "left" | "right";

/** 时间线方向 */
export type TimelineDirection = "vertical" | "horizontal";

/** 节点样式 */
export type TimelineNodeStyle = "dot" | "circle" | "square" | "image";

/** 卡片样式 */
export type TimelineCardStyle = "card" | "plain" | "bubble";

/** 连线风格 */
export type TimelineLineStyle = "solid" | "dashed" | "dotted";

/** 布局与外观配置（全部随文件持久化） */
export interface TimelineLayout {
    direction: TimelineDirection;
    node_style: TimelineNodeStyle;
    card_style: TimelineCardStyle;
    line_style: TimelineLineStyle;
    /** 事件是否在两侧交替分布 */
    alternate: boolean;
    /** 是否显示节点到卡片的连线 */
    show_connector: boolean;
    /** 主轴与阶段色带的基础色 */
    axis_color: string;
    /** 画布缩放比例（1 = 100%），随文档保存 */
    zoom?: number;
    /** 画布横向滚动位置（zoom=1 的内容坐标），随文档保存 */
    scroll_x?: number;
    /** 画布纵向滚动位置（zoom=1 的内容坐标），随文档保存 */
    scroll_y?: number;
}

/** 单条事件 */
export interface TimelineEvent {
    id: string;
    title: string;
    desc?: string;
    /** 日期，格式随意（字符串），可选。旧字段，仅用于兼容历史文件 */
    date?: string;
    /** 起始时间：显示在气泡左侧（横向布局时为上方） */
    startTime?: string;
    /** 结束时间：显示在气泡右侧（横向布局时为下方） */
    endTime?: string;
    /** 逻辑侧 */
    side: TimelineSide;
    /** 在本阶段内沿轴方向的相对位置 0~1 */
    offset: number;
    color?: string;
    /** 图片地址（node_style = image 时使用），可选 */
    image?: string;
/**
 * 卡片沿侧向的宽度（px，zoom=1）。
 * 不设置时由 CSS 自适应（占主轴一侧的可用宽度），
 * 设置后用户拖动卡片外边缘即可固定宽度。
 */
width?: number;
/**
 * 卡片到主轴之间的连线长度（px，zoom=1）。
 * 不设置时用默认间距（CSS 变量 --side-gap）。
 */
link_length?: number;
}

/** 一个阶段 */
export interface TimelinePhase {
    id: string;
    name: string;
    /** 阶段描述，可选 */
    desc?: string;
    color?: string;
    /** 折叠后只显示阶段头 */
    collapsed?: boolean;
    /** 是否显示阶段头（气泡标签）。默认 true；关闭后只保留轴上的色带 */
    head_visible?: boolean;
    /** 阶段头宽度（px，zoom=1），未设置时按内容自适应 */
    head_width?: number;
    events: TimelineEvent[];
}

/** 时间线文档 */
export interface TimelineDoc {
    version: number;
    title?: string;
    layout: TimelineLayout;
    phases: TimelinePhase[];
}

/** 默认色板：供新建阶段/事件循环取色 */
export const TIMELINE_COLORS = [
    "#1a73e8", "#34a853", "#fbbc04", "#ea4335", "#a142f4", "#00acc1",
];

/** 阶段头沿轴方向的厚度（px，zoom=1）：与 CSS 中 .timeline-phase__head 保持一致 */
export const PHASE_HEAD_SIZE = 36;

/** 单个事件在阶段内沿轴占用的长度（px，zoom=1），阶段长度由事件数决定 */
export const EVENT_SLOT_SIZE = 96;

/** 阶段沿轴的最小长度（px，zoom=1）：即使没有事件也留出头 + 一段余量 */
export const MIN_PHASE_SIZE = PHASE_HEAD_SIZE + EVENT_SLOT_SIZE;

/** 缩放上下限 */
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 3;

/** 事件卡片宽度上下限（px，zoom=1） */
export const MIN_EVENT_WIDTH = 80;
export const MAX_EVENT_WIDTH = 1200;

/** 连线长度上下限（px，zoom=1） */
export const MIN_LINK_LENGTH = 8;
export const MAX_LINK_LENGTH = 800;

/** 默认连线长度（px，zoom=1）：与 CSS 变量 --side-gap 保持一致 */
export const DEFAULT_LINK_LENGTH = 42;

/** 默认布局配置 */
export function default_layout(): TimelineLayout {
    return {
        direction: "vertical",
        node_style: "dot",
        card_style: "card",
        line_style: "solid",
        alternate: false,
        show_connector: true,
        axis_color: "#1a73e8",
        zoom: 1,
        scroll_x: 0,
        scroll_y: 0,
    };
}

/** 生成一个短 id（时间戳 + 随机数，冲突概率极低，足够本地使用） */
export function gen_id(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 数值裁剪，非数字时回退默认值 */
export function clamp_num(v: any, min: number, max: number, fallback: number): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

/** 从给定候选里取合法值，否则用默认值 */
function pick<T extends string>(v: any, list: readonly T[], fallback: T): T {
    return list.includes(v) ? (v as T) : fallback;
}

/** 建一个空阶段 */
export function new_phase(index: number, name?: string): TimelinePhase {
    return {
        id: gen_id(),
        name: name ?? `阶段 ${index + 1}`,
        color: TIMELINE_COLORS[index % TIMELINE_COLORS.length],
        collapsed: false,
        head_visible: true,
        events: [],
    };
}

/** 建一条事件 */
export function new_event(side: TimelineSide = "right", offset = 0.5): TimelineEvent {
    return {
        id: gen_id(),
        title: "新事件",
        desc: "",
        startTime: "",
        endTime: "",
        side,
        offset,
        color: "",
        image: "",
    };
}

/** 新建文件的初始文档：给一个可用的起始时间线 */
export function default_doc(): TimelineDoc {
    const phase = new_phase(0, "阶段一");
    phase.events.push({
        id: gen_id(),
        title: "起点",
        desc: "在这里描述事件",
        startTime: new Date().toISOString().slice(0, 10),
        endTime: "",
        side: "right",
        offset: 0.5,
        color: "",
        image: "",
    });
    return {
        version: 2,
        title: "时间线",
        layout: default_layout(),
        phases: [phase],
    };
}

/**
 * 校验并规整外部数据成规范的 TimelineDoc。
 * 无论输入多么脏（null/非对象/字段缺失/类型错误），都返回一个可用的文档，
 * 保证编辑器不会因为坏数据崩掉；这就是向前兼容的落点：
 * 未来新增字段在旧版本打开时会被忽略，旧文件在新版本打开时缺失字段由这里补默认值。
 */
export function normalize_doc(raw: any): TimelineDoc {
    const src = raw && typeof raw === "object" ? raw : {};
    const phases: TimelinePhase[] = [];
    const src_phases = Array.isArray(src.phases) ? src.phases : [];
    for (const p of src_phases) {
        if (!p || typeof p !== "object") continue;
        const events: TimelineEvent[] = [];
        const src_events = Array.isArray(p.events) ? p.events : [];
        for (const e of src_events) {
            if (!e || typeof e !== "object") continue;
            events.push({
                id: typeof e.id === "string" && e.id ? e.id : gen_id(),
                title: typeof e.title === "string" ? e.title : "",
                desc: typeof e.desc === "string" ? e.desc : "",
                date: typeof e.date === "string" ? e.date : "",
                // 旧文件只有 date：没有 startTime 时用它兜底，保证旧文件能正常显示
                startTime:
                    typeof e.startTime === "string"
                        ? e.startTime
                        : typeof e.date === "string"
                          ? e.date
                          : "",
                endTime: typeof e.endTime === "string" ? e.endTime : "",
                side: e.side === "left" ? "left" : "right",
                offset: clamp_num(e.offset, 0, 1, 0.5),
                color: typeof e.color === "string" ? e.color : "",
                image: typeof e.image === "string" ? e.image : "",
                // 未设置宽度时留空，由 CSS 自适应
                width:
                    e.width == null
                        ? undefined
                        : clamp_num(e.width, MIN_EVENT_WIDTH, MAX_EVENT_WIDTH, undefined as any),
                // 未设置连线长度时留空，用默认间距
                link_length:
                    e.link_length == null
                        ? undefined
                        : clamp_num(
                              e.link_length,
                              MIN_LINK_LENGTH,
                              MAX_LINK_LENGTH,
                              undefined as any,
                          ),
            });
        }
        phases.push({
            id: typeof p.id === "string" && p.id ? p.id : gen_id(),
            name: typeof p.name === "string" ? p.name : "",
            desc: typeof p.desc === "string" ? p.desc : "",
            color: typeof p.color === "string" ? p.color : "",
            collapsed: p.collapsed === true,
            // 阶段头默认显示；只有显式 false 才隐藏
            head_visible: p.head_visible !== false,
            // 未设置宽度时留空，由 CSS 自适应
            head_width:
                p.head_width == null
                    ? undefined
                    : clamp_num(p.head_width, MIN_EVENT_WIDTH, MAX_EVENT_WIDTH, undefined as any),
            events,
        });
    }
    return {
        version: typeof src.version === "number" ? Math.max(src.version, 2) : 2,
        title: typeof src.title === "string" ? src.title : "",
        layout: normalize_layout(src.layout),
        phases,
    };
}

/** 规整布局配置：缺失或非法字段一律补默认值 */
function normalize_layout(raw: any): TimelineLayout {
    const d = default_layout();
    const s = raw && typeof raw === "object" ? raw : {};
    return {
        direction: pick(s.direction, ["vertical", "horizontal"] as const, d.direction),
        node_style: pick(
            s.node_style,
            ["dot", "circle", "square", "image"] as const,
            d.node_style,
        ),
        card_style: pick(s.card_style, ["card", "plain", "bubble"] as const, d.card_style),
        line_style: pick(
            s.line_style,
            ["solid", "dashed", "dotted"] as const,
            d.line_style,
        ),
        alternate: s.alternate === true,
        // 默认开启连线；只有显式 false 才关闭
        show_connector: s.show_connector !== false,
        axis_color: typeof s.axis_color === "string" && s.axis_color ? s.axis_color : d.axis_color,
        zoom: clamp_num(s.zoom, MIN_ZOOM, MAX_ZOOM, 1),
        scroll_x: typeof s.scroll_x === "number" ? Math.max(0, s.scroll_x) : 0,
        scroll_y: typeof s.scroll_y === "number" ? Math.max(0, s.scroll_y) : 0,
    };
}

/** 解析文件原始文本；解析失败返回 null（由调用方决定兜底策略） */
export function parse_doc(text: any): TimelineDoc | null {
    if (text && typeof text === "object") {
        return normalize_doc(text);
    }
    if (typeof text !== "string" || !text.trim()) {
        return null;
    }
    try {
        return normalize_doc(JSON.parse(text));
    } catch {
        return null;
    }
}

/** 序列化文档为文件内容 */
export function stringify_doc(doc: TimelineDoc): string {
    return JSON.stringify(doc, null, 2);
}

/**
 * 阶段在 zoom=1 时的沿轴尺寸。
 * 由内容决定：阶段头厚度 + 事件数 × 单事件槽位，不再人工拉伸。
 */
export function phase_size(p: TimelinePhase): number {
    return Math.max(MIN_PHASE_SIZE, PHASE_HEAD_SIZE + p.events.length * EVENT_SLOT_SIZE);
}

/** SVG 连线样式的 stroke-dasharray 取值 */
export function dash_array(style: TimelineLineStyle): string {
    if (style === "dashed") return "8 5";
    if (style === "dotted") return "2 4";
    return "";
}

/** 卡片四角圆角（SVG 与 CSS 共用同一套观感） */
export function card_radius(style: TimelineCardStyle): number {
    if (style === "bubble") return 14;
    if (style === "plain") return 0;
    return 8;
}

/**
 * 导出 SVG：按当前布局把文档渲染成静态矢量图。
 * 纵向与横向共用同一套坐标计算：把「沿轴方向」映射为纵向的 y / 横向的 x，
 * 把「侧向」映射为纵向的 x / 横向的 y。
 */
/** 估算一张事件卡片的高度（用于静态导出，与编辑器实测高度尽量接近） */
function estimate_card_h(e: TimelineEvent, card_w: number): number {
    // 与 CSS 字号匹配：标题 13、描述 11.5，行高约 1.35
    const title_fs = 13;
    const desc_fs = 11.5;
    const date_fs = 11;
    let h = 16; // 上下内边距
    if (e.startTime || e.endTime) h += date_fs * 1.35; // 卡片首行是时间
    h += Math.max(1, fit_lines(e.title, card_w - 20, title_fs).length) * title_fs * 1.35;
    if (e.desc) {
        h += 4 + fit_lines(e.desc, card_w - 20, desc_fs).length * desc_fs * 1.35;
    }
    if (e.image) h += 80;
    return Math.max(40, Math.round(h));
}

/**
 * 把时间线文档转成静态 SVG 字符串。
 * @param responsive true = 宽度自适应容器（用于 md 嵌入），false = 固定尺寸（用于导出下载）
 */
export function doc_to_svg(doc: TimelineDoc, responsive = false): string {
    const {layout} = doc;
    const vertical = layout.direction === "vertical";
    // 侧向尺寸：卡片到轴的最大距离 + 卡片宽度
    const side_gap = 40;
    const card_w = vertical ? 300 : 240;
    const card_h = 80;
    const head = 56;
    const pad = 40;
    const axis_color = layout.axis_color;

    const esc = (s: string) =>
        (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 每段沿轴方向的尺寸：按事件数 + 同侧实测（估算）高度
    // 与编辑器一致：同侧卡片依次排开，阶段长度 = max(按数量估算, 按卡片高度累加)
    const GAP = 12;
    const phase_layouts = doc.phases.map((p) => {
        const acc: Record<string, number> = {left: 0, right: 0};
        const cards = p.events.map((e, ei) => {
            const side: TimelineSide = layout.alternate ? (ei % 2 === 0 ? "left" : "right") : e.side;
            const w = e.width ?? card_w;
            const h = estimate_card_h(e, w);
            const along_pos = acc[side];
            acc[side] += h + GAP;
            return {e, side, w, h, along: along_pos};
        });
        const by_events = Math.max(acc.left, acc.right);
        const size = p.collapsed ? 48 : Math.max(phase_size(p), PHASE_HEAD_SIZE + by_events);
        return {cards, size};
    });
    const total = head + pad * 2 + phase_layouts.reduce((s, v) => s + v.size, 0);

    // 侧向尺寸取「最大卡片宽度 + 最大连线长度」，保证内容不被裁掉
    let max_card_w = card_w;
    let max_gap = side_gap;
    for (const p of doc.phases) {
        for (const e of p.events) {
            if (e.width) max_card_w = Math.max(max_card_w, e.width);
            if (e.link_length) max_gap = Math.max(max_gap, e.link_length);
        }
    }
    // 画布尺寸：纵向时宽度固定、高度按内容；横向时反过来
    // 纵向时主轴靠左：左侧留出「阶段头宽度」与「左侧卡片实际需要的宽度」的较大者
    const left_need = (() => {
        let w = 0;
        // 阶段头贴在轴左侧，宽度按文字自适应但封顶 HEAD_MAX_W
        doc.phases.forEach((p) => {
            if (p.head_visible === false) return;
            w = Math.max(w, Math.min(HEAD_MAX_W, Math.ceil(text_width(p.name, 13)) + 24));
        });
        // 左侧卡片
        doc.phases.forEach((p) => {
            p.events.forEach((e, ei) => {
                const side: TimelineSide = layout.alternate ? (ei % 2 === 0 ? "left" : "right") : e.side;
                if (side === "left") w = Math.max(w, (e.width ?? card_w) + (e.link_length ?? side_gap));
            });
        });
        return w;
    })();
    const right_need = max_card_w + max_gap;
    // 纵向：主轴居中，左右各留「阶段头/卡片所需宽度」与「卡片宽度」的较大者
    const side_need = Math.max(left_need, right_need);
    const canvas_w = vertical ? pad + side_need * 2 : total;
    const canvas_h = vertical ? total : pad * 2 + card_h * 2 + max_gap * 2;
    // 轴线所在位置：纵向时贴左（左侧留卡片空间 + 一点内边距），横向时居中
    const axis_pos = vertical ? canvas_w / 2 : canvas_h / 2;

    const out: string[] = [];
    const size_attrs = responsive
        ? `viewBox="0 0 ${canvas_w} ${canvas_h}" width="100%" style="max-width:${canvas_w}px"`
        : `width="${canvas_w}" height="${canvas_h}" viewBox="0 0 ${canvas_w} ${canvas_h}"`;
    out.push(
        `<svg xmlns="http://www.w3.org/2000/svg" ${size_attrs} preserveAspectRatio="xMidYMin meet" font-family="sans-serif">`,
    );
    out.push(`<rect width="${canvas_w}" height="${canvas_h}" fill="#ffffff"/>`);
    // 主轴
    if (vertical) {
        out.push(
            `<line x1="${axis_pos}" y1="${head}" x2="${axis_pos}" y2="${canvas_h - pad}" stroke="${axis_color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${dash_array(layout.line_style)}"/>`,
        );
    } else {
        out.push(
            `<line x1="${head}" y1="${axis_pos}" x2="${canvas_w - pad}" y2="${axis_pos}" stroke="${axis_color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${dash_array(layout.line_style)}"/>`,
        );
    }

    let cursor = head + pad;
    for (let i = 0; i < doc.phases.length; i++) {
        const p = doc.phases[i];
        const {cards, size} = phase_layouts[i];
        const color = p.color || axis_color;
        // 阶段头：沿轴方向居中放置一个圆角色块（隐藏时不画）
        if (p.head_visible !== false) {
            if (vertical) {
                out.push(head_chip(axis_pos, cursor, true, color, esc(p.name)));
            } else {
                out.push(head_chip(axis_pos, cursor, false, color, esc(p.name)));
            }
        }
        if (!p.collapsed) {
            cards.forEach((c) => {
                const e = c.e;
                // 沿轴位置 = 阶段起点 + 同侧前序卡片高度累加（与编辑器一致，避免重叠）
                const along = cursor + c.along;
                const to_right = c.side === "right";
                out.push(
                    event_svg(
                        e,
                        p,
                        layout,
                        vertical,
                        along,
                        axis_pos,
                        to_right,
                        // 该事件自己的连线长度，未设置用默认间距
                        e.link_length ?? side_gap,
                        c.w,
                        c.h,
                        axis_color,
                    ),
                );
            });
        }
        cursor += size;
    }
    out.push("</svg>");
    return out.join("\n");
}

/** 导出时阶段头的图形 */
/** 估算文本宽度（px）：中文按字号计，英文按 0.55 倍计 */
function text_width(s: string, fs: number): number {
    let w = 0;
    for (const ch of s ?? "") {
        w += /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? fs : fs * 0.55;
    }
    return w;
}

/** 阶段头最大宽度（超出则换行，与编辑器的气泡行为一致） */
const HEAD_MAX_W = 200;

function head_chip(axis: number, along: number, vertical: boolean, color: string, name: string): string {
    const h = 26;
    const fs = 13;
    // 名称按最大宽度换行，宽度取实际文字宽度（封顶 HEAD_MAX_W）
    const natural = Math.ceil(text_width(name, fs));
    const w = Math.min(HEAD_MAX_W, Math.max(60, natural + 24));
    if (vertical) {
        // 纵向：阶段头骑在轴上（居中），与编辑器一致
        const lines = wrap_text(name, Math.max(1, Math.floor((w - 24) / fs)));
        const line_h = 18;
        const box_h = Math.max(h, lines.length * line_h + 8);
        const out = [
            `<rect x="${axis - w / 2}" y="${along}" width="${w}" height="${box_h}" rx="13" fill="${color}"/>`,
        ];
        lines.forEach((ln, i) => {
            out.push(
                `<text x="${axis}" y="${along + 18 + i * line_h}" font-size="${fs}" text-anchor="middle" fill="#fff">${ln}</text>`,
            );
        });
        return out.join("\n");
    }
    // 横向：阶段头竖着的胶囊
    return [
        `<rect x="${along}" y="${axis - w / 2}" width="${h}" height="${w}" rx="13" fill="${color}"/>`,
        `<text x="${along + 18}" y="${axis}" font-size="${fs}" text-anchor="middle" fill="#fff" transform="rotate(-90 ${along + 18} ${axis})">${name}</text>`,
    ].join("\n");
}

/** 导出时单条事件：连线 + 节点 + 卡片 */
function event_svg(
    e: TimelineEvent,
    p: TimelinePhase,
    layout: TimelineLayout,
    vertical: boolean,
    along: number,
    axis: number,
    to_right: boolean,
    side_gap: number,
    card_w: number,
    card_h: number,
    axis_color: string,
): string {
    const color = e.color || p.color || axis_color;
    const esc = (s: string) =>
        (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // 卡片靠近轴的一边：沿侧向从轴往外推 side_gap
    const near = to_right ? axis + side_gap : axis - side_gap - card_w;
    const out: string[] = [];

    // 节点：在轴上
    const r = layout.node_style === "dot" ? 5 : layout.node_style === "square" ? 9 : 10;
    if (layout.node_style === "square") {
        out.push(
            `<rect x="${(vertical ? axis : along) - r}" y="${(vertical ? along : axis) - r}" width="${r * 2}" height="${r * 2}" fill="${color}"/>`,
        );
    } else {
        out.push(
            `<circle cx="${vertical ? axis : along}" cy="${vertical ? along : axis}" r="${r}" fill="${color}" stroke="#fff" stroke-width="2"/>`,
        );
    }
    // 连线
    if (layout.show_connector) {
        if (vertical) {
            const x1 = to_right ? axis + r : axis - r;
            const x2 = to_right ? near : near + card_w;
            out.push(
                `<line x1="${x1}" y1="${along}" x2="${x2}" y2="${along}" stroke="${color}" stroke-width="2" stroke-dasharray="${dash_array(layout.line_style)}"/>`,
            );
        } else {
            const y1 = to_right ? axis + r : axis - r;
            const y2 = to_right ? near : near + card_h;
            out.push(
                `<line x1="${along}" y1="${y1}" x2="${along}" y2="${y2}" stroke="${color}" stroke-width="2" stroke-dasharray="${dash_array(layout.line_style)}"/>`,
            );
        }
    }
    // 卡片：沿轴方向顶部对齐节点（与编辑器一致），尺寸取传入的实际值
    const rx = layout.card_style === "bubble" ? 14 : layout.card_style === "plain" ? 0 : 8;
    const box_x = vertical ? near : along;
    const box_y = vertical ? along : near;
    const w = card_w;
    const h = card_h;
    const fill = layout.card_style === "plain" ? "none" : "#ffffff";
    out.push(
        `<rect x="${box_x}" y="${box_y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`,
    );
    // 标题：按卡片可用宽度换行绘制（按字符实际宽度算，中英文混排也准）
    const title_fs = 13;
    const title_lines = fit_lines(e.title, w - 20, title_fs);
    let ty = box_y + 22;
    title_lines.forEach((ln, i) => {
        out.push(
            `<text x="${box_x + 10}" y="${ty}" font-size="${title_fs}" font-weight="${i === 0 ? 600 : 400}" fill="#202124">${esc(ln)}</text>`,
        );
        ty += title_fs * 1.35;
    });
    // 描述：换行绘制
    if (e.desc) {
        const desc_fs = 11.5;
        fit_lines(e.desc, w - 20, desc_fs).forEach((ln) => {
            out.push(
                `<text x="${box_x + 10}" y="${ty}" font-size="${desc_fs}" fill="#5f6368">${esc(ln)}</text>`,
            );
            ty += desc_fs * 1.35;
        });
    }
    if (e.startTime || e.endTime) {
        // 时间骑在中轴上，分列节点左右（纵向）或上下（横向），与编辑器一致
        const tf = 11;
        const y = vertical ? along + 4 : box_y + 14;
        if (vertical) {
            if (e.startTime) {
                out.push(
                    `<text x="${axis - r - 4}" y="${y}" font-size="${tf}" text-anchor="end" fill="#5f6368">${esc(e.startTime)}</text>`,
                );
            }
            if (e.endTime) {
                out.push(
                    `<text x="${axis + r + 4}" y="${y}" font-size="${tf}" fill="#5f6368">${esc(e.endTime)}</text>`,
                );
            }
        } else {
            if (e.startTime) {
                out.push(
                    `<text x="${axis}" y="${axis - r - 4}" font-size="${tf}" text-anchor="middle" fill="#5f6368">${esc(e.startTime)}</text>`,
                );
            }
            if (e.endTime) {
                out.push(
                    `<text x="${axis}" y="${axis + r + 11}" font-size="${tf}" text-anchor="middle" fill="#5f6368">${esc(e.endTime)}</text>`,
                );
            }
        }
    }
    return out.join("\n");
}

/** 按每行最大字符数把文本切成多行（保留原有换行） */
/** 单个字符的显示宽度（中文按字号，英文/数字/符号按 0.55 倍） */
function char_w(ch: string, fs: number): number {
    return /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? fs : fs * 0.55;
}

/**
 * 按可用宽度把文本切成多行（按字符实际宽度累加，中英文混排也能正确换行）
 */
function fit_lines(text: string, max_w: number, fs: number): string[] {
    if (!text) return [];
    const out: string[] = [];
    for (const seg of text.split("\n")) {
        if (!seg) {
            out.push("");
            continue;
        }
        let line = "";
        let w = 0;
        for (const ch of seg) {
            const cw = char_w(ch, fs);
            if (w + cw > max_w && line) {
                out.push(line);
                line = ch;
                w = cw;
            } else {
                line += ch;
                w += cw;
            }
        }
        if (line) out.push(line);
    }
    return out;
}

function wrap_text(text: string, per_line: number): string[] {
    if (!text) return [];
    const out: string[] = [];
    for (const seg of text.split("\n")) {
        if (!seg) {
            out.push("");
            continue;
        }
        for (let i = 0; i < seg.length; i += per_line) {
            out.push(seg.slice(i, i + per_line));
        }
    }
    return out;
}
