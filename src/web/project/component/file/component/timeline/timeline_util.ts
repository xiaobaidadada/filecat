/**
 * 时间轴编辑器（.timeline）的数据模型与工具函数。
 *
 * 文件内容是一份 JSON，顶层结构：
 * {
 *   version: 2,
 *   title: "标题",
 *   layout: { ... },     // 布局与外观配置（随文件持久化）
 *   pad: { start, end }, // 轴向两端的留白，可无限拉伸
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
 * { id, name, color, collapsed, size, events }
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

/** 时间轴方向 */
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
}

/** 单条事件 */
export interface TimelineEvent {
    id: string;
    title: string;
    desc?: string;
    /** 日期，格式随意（字符串），可选 */
    date?: string;
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
    color?: string;
    /** 折叠后只显示阶段头 */
    collapsed?: boolean;
    /** 是否显示阶段头（气泡标签）。默认 true；关闭后只保留轴上的色带 */
    head_visible?: boolean;
    /** 沿轴方向的尺寸（px，zoom=1 时） */
    size: number;
    events: TimelineEvent[];
}

/** 时间轴文档 */
export interface TimelineDoc {
    version: number;
    title?: string;
    layout: TimelineLayout;
    /** 轴向两端的留白，可无限拉伸 */
    pad: { start: number; end: number };
    phases: TimelinePhase[];
}

/** 默认色板：供新建阶段/事件循环取色 */
export const TIMELINE_COLORS = [
    "#1a73e8", "#34a853", "#fbbc04", "#ea4335", "#a142f4", "#00acc1",
];

/** 默认阶段沿轴尺寸（px，zoom=1） */
export const DEFAULT_PHASE_SIZE = 320;

/** 阶段尺寸上下限 */
export const MIN_PHASE_SIZE = 80;
export const MAX_PHASE_SIZE = 8000;

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
        size: DEFAULT_PHASE_SIZE,
        events: [],
    };
}

/** 建一条事件 */
export function new_event(side: TimelineSide = "right", offset = 0.5): TimelineEvent {
    return {
        id: gen_id(),
        title: "新事件",
        desc: "",
        date: "",
        side,
        offset,
        color: "",
        image: "",
    };
}

/** 新建文件的初始文档：给一个可用的起始时间轴 */
export function default_doc(): TimelineDoc {
    const phase = new_phase(0, "阶段一");
    phase.events.push({
        id: gen_id(),
        title: "起点",
        desc: "在这里描述事件",
        date: new Date().toISOString().slice(0, 10),
        side: "right",
        offset: 0.5,
        color: "",
        image: "",
    });
    return {
        version: 2,
        title: "时间轴",
        layout: default_layout(),
        pad: {start: 120, end: 120},
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
            color: typeof p.color === "string" ? p.color : "",
            collapsed: p.collapsed === true,
            // 阶段头默认显示；只有显式 false 才隐藏
            head_visible: p.head_visible !== false,
            // 兼容旧字段 height/extraHeight：合并成 size
            size:
                p.size != null
                    ? clamp_num(p.size, MIN_PHASE_SIZE, MAX_PHASE_SIZE, DEFAULT_PHASE_SIZE)
                    : clamp_num(
                          (Number(p.height) || DEFAULT_PHASE_SIZE) + (Number(p.extraHeight) || 0),
                          MIN_PHASE_SIZE,
                          MAX_PHASE_SIZE,
                          DEFAULT_PHASE_SIZE,
                      ),
            events,
        });
    }
    return {
        version: typeof src.version === "number" ? Math.max(src.version, 2) : 2,
        title: typeof src.title === "string" ? src.title : "",
        layout: normalize_layout(src.layout),
        pad: normalize_pad(src),
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
    };
}

/**
 * 规整两端留白。
 * 旧版本是 topPad / bottomPad 两个字段，这里做一次合并映射，
 * 保证老文件在新版本打开时留白不丢失。
 */
function normalize_pad(src: any): {start: number; end: number} {
    if (src.pad && typeof src.pad === "object") {
        return {
            start: clamp_num(src.pad.start, 0, Number.MAX_SAFE_INTEGER, 120),
            end: clamp_num(src.pad.end, 0, Number.MAX_SAFE_INTEGER, 120),
        };
    }
    return {
        start: clamp_num(src.topPad, 0, Number.MAX_SAFE_INTEGER, 120),
        end: clamp_num(src.bottomPad, 0, Number.MAX_SAFE_INTEGER, 120),
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
 * 按日期排序：有日期的排前面且按时间升序，没日期的保持原有相对顺序排在后面。
 * 只重排 events 数组顺序，不改 offset（offset 是用户手动摆放的视觉位置）。
 */
export function sort_events_by_date(events: TimelineEvent[]): TimelineEvent[] {
    const with_date = events.filter((e) => !!e.date);
    const without_date = events.filter((e) => !e.date);
    with_date.sort((a, b) => {
        const ta = Date.parse(a.date as string);
        const tb = Date.parse(b.date as string);
        if (isNaN(ta) && isNaN(tb)) return 0;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        return ta - tb;
    });
    return [...with_date, ...without_date];
}

/** 阶段在 zoom=1 时的沿轴尺寸（不含折叠处理） */
export function phase_size(p: TimelinePhase): number {
    return p.size || DEFAULT_PHASE_SIZE;
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
export function doc_to_svg(doc: TimelineDoc): string {
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

    // 每段沿轴方向的尺寸：折叠阶段只留头部
    const sizes = doc.phases.map((p) =>
        p.collapsed ? 48 : Math.max(phase_size(p), card_h + side_gap * 2),
    );
    const total = head + pad * 2 + sizes.reduce((s, v) => s + v, 0);

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
    const canvas_w = vertical ? pad * 2 + max_card_w * 2 + max_gap * 2 : total;
    const canvas_h = vertical ? total : pad * 2 + card_h * 2 + max_gap * 2;
    // 轴线所在位置（纵向取横向中点，横向取纵向中点）
    const axis_pos = vertical ? canvas_w / 2 : canvas_h / 2;

    const out: string[] = [];
    out.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas_w}" height="${canvas_h}" viewBox="0 0 ${canvas_w} ${canvas_h}" font-family="sans-serif">`,
    );
    out.push(`<rect width="${canvas_w}" height="${canvas_h}" fill="#ffffff"/>`);
    out.push(
        `<text x="${pad}" y="32" font-size="18" font-weight="600" fill="#202124">${esc(doc.title ?? "")}</text>`,
    );
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
        const size = sizes[i];
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
            p.events.forEach((e, ei) => {
                // 事件沿轴的位置 = 阶段起点 + offset × 阶段尺寸
                const along = cursor + e.offset * size;
                // 侧向：开启交替时按索引轮流决定，否则按事件自身的 side
                const to_right = layout.alternate ? ei % 2 === 1 : e.side === "right";
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
                        // 卡片宽度：用户设置过就用它
                        e.width ?? card_w,
                        card_h,
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
function head_chip(axis: number, along: number, vertical: boolean, color: string, name: string): string {
    const w = 140;
    const h = 26;
    if (vertical) {
        // 纵向：阶段头是横跨轴的胶囊
        return [
            `<rect x="${axis - w / 2}" y="${along}" width="${w}" height="${h}" rx="13" fill="${color}"/>`,
            `<text x="${axis}" y="${along + 18}" font-size="13" text-anchor="middle" fill="#fff">${name}</text>`,
        ].join("\n");
    }
    // 横向：阶段头竖着的胶囊
    return [
        `<rect x="${along}" y="${axis - w / 2}" width="${h}" height="${w}" rx="13" fill="${color}"/>`,
        `<text x="${along + 18}" y="${axis}" font-size="13" text-anchor="middle" fill="#fff" transform="rotate(-90 ${along + 18} ${axis})">${name}</text>`,
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
    // 卡片
    const rx = layout.card_style === "bubble" ? 14 : layout.card_style === "plain" ? 0 : 8;
    const box_x = vertical ? near : along - card_w / 2;
    const box_y = vertical ? along - 26 : near;
    const w = vertical ? card_w : card_w;
    const h = vertical ? 52 : card_h;
    const fill = layout.card_style === "plain" ? "none" : "#ffffff";
    out.push(
        `<rect x="${box_x}" y="${box_y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`,
    );
    out.push(
        `<text x="${box_x + 12}" y="${box_y + 22}" font-size="13" font-weight="600" fill="#202124">${esc(e.title)}</text>`,
    );
    if (e.date) {
        out.push(
            `<text x="${box_x + 12}" y="${box_y + 40}" font-size="11" fill="#5f6368">${esc(e.date)}</text>`,
        );
    }
    return out.join("\n");
}
