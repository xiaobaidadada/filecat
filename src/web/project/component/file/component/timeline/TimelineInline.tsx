import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {Http} from "../../../../util/http";
import {NotyFail} from "../../../../util/noty";
import {useTranslation} from "react-i18next";
import {
    DEFAULT_LINK_LENGTH,
    EVENT_SLOT_SIZE,
    MAX_EVENT_WIDTH,
    MAX_LINK_LENGTH,
    MAX_ZOOM,
    MIN_EVENT_WIDTH,
    MIN_LINK_LENGTH,
    MIN_ZOOM,
    TIMELINE_COLORS,
    TimelineCardStyle,
    TimelineDoc,
    TimelineEvent,
    TimelineLayout,
    TimelineLineStyle,
    TimelineNodeStyle,
    TimelinePhase,
    TimelineSide,
    clamp_num,
    default_doc,
    doc_to_svg,
    new_event,
    new_phase,
    normalize_doc,
    parse_doc,
    phase_size,
    stringify_doc,
} from "./timeline_util";

/**
 * 时间线编辑器（.timeline）。
 *
 * 一套数据、两种方向：
 *  - 纵向（默认）：主轴竖直，阶段自上而下排布，事件挂在左右两侧
 *  - 横向：主轴水平，阶段自左而右排布，事件挂在上下两侧
 * 事件不能用拖动改变位置与所属侧（只能用右侧编辑栏的按钮）；
 * 阶段可通过拖动交换顺序；卡片宽度、连线长度可拖动调整。
 */

export type TimelineHandle = {
    /** 立即保存，返回是否成功 */
    save: () => Promise<boolean>;
    /** 是否有未保存的改动 */
    is_dirty: () => boolean;
    /** 当前是否处于编辑模式（视图模式下的改动绝不保存） */
    is_edit_mode: () => boolean;
};

type Props = {
    /** 读取内容的地址 */
    url?: string;
    /** 直接传入的文档（只读嵌入时用，优先于 url） */
    doc?: TimelineDoc;
    /** 切换文件时用于重建编辑器的 key */
    reset_key?: string;
    /** 保存实现：由外壳决定写到哪 */
    on_save: (context: string) => Promise<boolean>;
    on_dirty?: (dirty: boolean) => void;
    /** 编辑模式变化通知（外壳据此显隐保存按钮等） */
    on_edit_mode_change?: (edit: boolean) => void;
    register?: (handle: TimelineHandle) => void;
    /** 顶部额外内容（如全屏外壳的文件名、保存、关闭按钮） */
    header?: React.ReactNode;
    /** 是否为全屏浮层模式（影响容器样式类名） */
    fullscreen?: boolean;
    /** 只读嵌入模式（用于 md 内联展示）：隐藏工具栏、只读、不保存 */
    readonly?: boolean;
};

/** 事件在文档中的定位 */

/**
 * 阶段头沿轴方向的厚度（px，zoom=1）。
 * 事件在阶段内的可用区域要扣掉它，需与 CSS 中 .timeline-phase__head 保持一致。
 */
const PHASE_HEAD_SIZE = 36;
/** 阶段头在阶段块内的沿轴偏移，对应 CSS 里的 .3rem */
const HEAD_OFFSET = 4.8;
/** 阶段头与首张卡片之间的安全间距（避免贴住／压住） */
const HEAD_GAP = 6;

/** 节点样式对应的 CSS 类名后缀 */
function node_class(style: TimelineNodeStyle): string {
    return `timeline-node--${style}`;
}

/** 三个线型共用的 border-style 值（实线在轴带上用背景填充，边框隐藏） */
function axis_border(line_style: TimelineLineStyle): "solid" | "dashed" | "dotted" {
    if (line_style === "dashed") return "dashed";
    if (line_style === "dotted") return "dotted";
    return "solid";
}

export default function TimelineEditor(props: Props) {
    const {t} = useTranslation();
    const [doc, setDoc] = useState<TimelineDoc>(() => default_doc());
    const [loading, setLoading] = useState(true);
    const [error, set_error] = useState("");
    const [zoom, set_zoom] = useState(1);
    /**
     * 各阶段头的实测高度（px，zoom=1）。名称/描述换行后高度会变，
     * 折叠态的阶段间距、折叠阶段的头厚都必须用真实高度，否则会上下重合。
     */
    const [head_heights, set_head_heights] = useState<Record<string, number>>({});
    const report_head_height = useCallback((id: string, h: number) => {
        set_head_heights((cur) => (cur[id] === h ? cur : {...cur, [id]: h}));
    }, []);
    /** 各事件卡片的实测高度（px，zoom=1），用于同侧卡片顺序排布避免重叠 */
    const [event_heights, set_event_heights] = useState<Record<string, number>>({});
    const report_event_height = useCallback((id: string, h: number) => {
        set_event_heights((cur) => (cur[id] === h ? cur : {...cur, [id]: h}));
    }, []);
    /**
     * 编辑模式：关闭时是只读浏览态，所有改动（拖动/改文字/改样式/缩放）都不落盘；
     * 打开后所有改动才会保存。
     */
    const [edit_mode, set_edit_mode] = useState(false);

    /** 当前选中的对象 id（阶段或事件） */
    const [selected_id, set_selected_id] = useState<string | null>(null);
    /** 选中对象的类型：阶段 / 事件 */
    const [selected_kind, set_selected_kind] = useState<"phase" | "event">("event");
    const innerRef = useRef<HTMLDivElement | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const dirtyRef = useRef(false);
    const latest = useRef({props});
    latest.current = {props};

    // 撤销/重做：保存 JSON 快照
    const undoRef = useRef<string[]>([]);
    const redoRef = useRef<string[]>([]);
    const [history_tick, set_history_tick] = useState(0);

    /** 阶段拖动状态：记录被拖阶段的当前索引与开始时的文档快照 */
    const phase_dragRef = useRef<{from: number; snapshot: string} | null>(null);
    /** 正在被拖动的阶段 id（用于高亮） */
    const [drag_phase_id, set_drag_phase_id] = useState<string | null>(null);
    /** 落点插入位置（px，相对 timeline-inner 沿轴） */
    const [drop_pos, set_drop_pos] = useState<number | null>(null);

    const docRef = useRef<TimelineDoc>(doc);
    docRef.current = doc;
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    /** 当前是否纵向 */
    const vertical = doc.layout.direction === "vertical";

    const edit_modeRef = useRef(edit_mode);
    edit_modeRef.current = edit_mode;

    /** 标记内容变更：只读浏览态下不改标记（但清除标记始终允许，如保存成功后） */
    const mark_dirty = (dirty: boolean) => {
        if (dirty && !edit_modeRef.current) return;
        if (dirtyRef.current !== dirty) {
            dirtyRef.current = dirty;
            latest.current.props.on_dirty?.(dirty);
        }
    };

    /** 把一份快照压入撤销栈并清空重做栈 */
    const push_history = useCallback((snapshot: string) => {
        if (undoRef.current[undoRef.current.length - 1] !== snapshot) {
            undoRef.current.push(snapshot);
            if (undoRef.current.length > 100) undoRef.current.shift();
        }
        redoRef.current = [];
        set_history_tick((v) => v + 1);
    }, []);

    /** 结构性变更：记入撤销栈（只读浏览态下直接忽略） */
    const commit = useCallback(
        (next: TimelineDoc) => {
            if (!edit_modeRef.current) return;
            push_history(stringify_doc(docRef.current));
            // 同步 ref：同一帧内连续调用时不会基于旧文档计算
            docRef.current = next;
            setDoc(next);
            mark_dirty(true);
        },
        [push_history, mark_dirty],
    );

    /**
     * 任何模式下都能生效的结构性变更（如阶段倒置）。
     * 编辑模式：等价于 commit（进撤销栈、标 dirty、可保存）；
     * 视图模式：只改前端内存，不进撤销栈也不标 dirty，刷新即恢复。
     */
    const apply_any = (next: TimelineDoc) => {
        if (edit_modeRef.current) {
            commit(next);
            return;
        }
        docRef.current = next;
        setDoc(next);
    };

    const undo = useCallback(() => {
        if (!edit_modeRef.current) return;
        const prev = undoRef.current.pop();
        if (prev == null) return;
        redoRef.current.push(stringify_doc(docRef.current));
        setDoc(normalize_doc(JSON.parse(prev)));
        set_selected_id(null);
        mark_dirty(true);
        set_history_tick((v) => v + 1);
    }, []);

    const redo = useCallback(() => {
        if (!edit_modeRef.current) return;
        const next = redoRef.current.pop();
        if (next == null) return;
        undoRef.current.push(stringify_doc(docRef.current));
        setDoc(normalize_doc(JSON.parse(next)));
        set_selected_id(null);
        mark_dirty(true);
        set_history_tick((v) => v + 1);
    }, []);

    const save = async (): Promise<boolean> => {
        // 视图模式绝不落盘：即使外壳/快捷键绕过了按钮隐藏，这里也直接拒绝
        if (!edit_modeRef.current) {
            return false;
        }
        const ok = await latest.current.props.on_save(stringify_doc(docRef.current));
        if (ok) mark_dirty(false);
        return ok;
    };

    useEffect(() => {
        props.register?.({save, is_dirty: () => dirtyRef.current, is_edit_mode: () => edit_mode});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.register, edit_mode]);

    // 编辑模式变化时通知外壳（显隐保存按钮）
    useEffect(() => {
        latest.current.props.on_edit_mode_change?.(edit_mode);
    }, [edit_mode]);

    // 加载文件内容
    useEffect(() => {
        // 直接传入文档（md 只读嵌入）：不请求网络，只做只读渲染
        if (props.doc) {
            setDoc(props.doc);
            set_zoom(1);
            setLoading(false);
            set_error("");
            return;
        }
        if (!props.url) return;
        let cancelled = false;
        setLoading(true);
        set_error("");
        undoRef.current = [];
        redoRef.current = [];
        set_history_tick((v) => v + 1);
        set_selected_id(null);
        mark_dirty(false);
        (async () => {
            try {
                const raw = await Http.get(props.url as string);
                if (cancelled) return;
                const loaded = parse_doc(raw) ?? default_doc();
                setDoc(loaded);
                // 应用文档里保存的缩放
                set_zoom(clamp_num(loaded.layout.zoom ?? 1, MIN_ZOOM, MAX_ZOOM, 1));
                // 等布局稳定后还原滚动位置
                window.setTimeout(() => {
                    const el = scrollRef.current;
                    if (!el) return;
                    el.scrollLeft = (loaded.layout.scroll_x ?? 0) * (loaded.layout.zoom ?? 1);
                    el.scrollTop = (loaded.layout.scroll_y ?? 0) * (loaded.layout.zoom ?? 1);
                }, 60);
            } catch {
                if (cancelled) return;
                set_error(t("加载时间线失败"));
                NotyFail(t("加载时间线失败"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.url, props.doc]);

    /** 某阶段头的实际高度（px，zoom=1），未测量到时退回常量 */
    const head_h = (id: string) => head_heights[id] ?? PHASE_HEAD_SIZE;
    /** 折叠态高度 = 阶段头实际高度 + 上下留白（头部绝对定位在 .3rem 处） */
    const collapsed_h = (p: TimelinePhase) => Math.max(PHASE_HEAD_SIZE, head_h(p.id)) + 10;

    /** 某阶段内事件沿轴需要的总尺寸：同侧依次累加（与 PhaseBlock 内布局一致） */
    const events_total = (p: TimelinePhase) => {
        const GAP = 12;
        const axis_default = doc.layout.direction === "vertical" ? EVENT_SLOT_SIZE : 240;
        const acc: Record<string, number> = {left: 0, right: 0};
        p.events.forEach((e, ei) => {
            const side = doc.layout.alternate ? (ei % 2 === 0 ? "left" : "right") : e.side;
            acc[side] += (event_heights[e.id] ?? axis_default) + GAP;
        });
        return Math.max(acc.left, acc.right);
    };

    /** 某阶段沿轴占用的尺寸：折叠时只剩头；展开时按事件实测高度累加（未测量到的事件用固定槽位估算） */
    const phase_span = (p: TimelinePhase) => {
        if (p.collapsed) return collapsed_h(p);
        return PHASE_HEAD_SIZE + events_total(p);
    };

    /** 每个阶段沿轴方向的起点（折叠阶段按其阶段头实际高度计） */
    const phase_offsets = useMemo(() => {
        const list: number[] = [];
        let acc = 0;
        for (const p of doc.phases) {
            list.push(acc);
            acc += p.collapsed ? Math.max(PHASE_HEAD_SIZE, head_heights[p.id] ?? PHASE_HEAD_SIZE) + 10 : phase_span(p);
        }
        return list;
    }, [doc.phases, head_heights, event_heights]);

    // 阶段拖动：按住阶段头拖动，按指针在轴上的落点交换阶段顺序
    useEffect(() => {
        const reorder = (from: number, to: number) => {
            const phases = [...docRef.current.phases];
            if (from < 0 || from >= phases.length || to < 0 || to >= phases.length || from === to) return;
            const [moved] = phases.splice(from, 1);
            phases.splice(to, 0, moved);
            const next = {...docRef.current, phases};
            // 同步更新 ref：同一帧内连续 pointermove 时不会基于旧数组重复换位
            docRef.current = next;
            setDoc(next);
        };
        const on_move = (e: PointerEvent) => {
            const drag = phase_dragRef.current;
            const el = innerRef.current;
            if (!drag || !el) return;
            const rect = el.getBoundingClientRect();
            const z = zoomRef.current;
            const is_vertical = docRef.current.layout.direction === "vertical";
            const along = (is_vertical ? e.clientY - rect.top : e.clientX - rect.left) / z;
            // 找到指针落点所在的阶段索引
            const phases = docRef.current.phases;
            let target = phases.length - 1;
            for (let i = 0; i < phases.length; i++) {
                const start = phase_offsets[i];
                if (along <= start + phase_span(phases[i])) {
                    target = i;
                    break;
                }
            }
            // 落点指示线：贴到目标阶段沿轴的边界处
            const drop = target <= drag.from ? phase_offsets[target] : phase_offsets[target] + phase_span(phases[target]);
            set_drop_pos(drop);
            if (target !== drag.from) {
                reorder(drag.from, target);
                drag.from = target;
            }
        };
        const on_up = () => {
            const drag = phase_dragRef.current;
            if (!drag) return;
            phase_dragRef.current = null;
            document.body.classList.remove("timeline-phase-dragging");
            set_drag_phase_id(null);
            set_drop_pos(null);
            // 整段拖动只在结束时记一条撤销快照
            if (drag.snapshot != null && drag.snapshot !== stringify_doc(docRef.current)) {
                push_history(drag.snapshot);
                mark_dirty(true);
            }
        };
        document.addEventListener("pointermove", on_move);
        document.addEventListener("pointerup", on_up);
        document.addEventListener("pointercancel", on_up);
        return () => {
            document.removeEventListener("pointermove", on_move);
            document.removeEventListener("pointerup", on_up);
            document.removeEventListener("pointercancel", on_up);
        };
    }, [phase_offsets, push_history]);

    /** 在事件卡片上按下：开始拖拽 */
    /** 点击事件卡片：只做选中（不启动任何拖动，沿轴位置只能通过右侧编辑栏的上下移按钮调整） */
    const on_event_pointer_down = (e: React.PointerEvent, phase_index: number, event_index: number) => {
        if (!edit_modeRef.current) return;
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        // 点在输入框/按钮/宽度把手上不处理，避免误触发
        if (target.closest("input, textarea, button, select, [data-event-width], [data-event-link]")) return;
        e.stopPropagation();
        set_selected_kind("event");
        set_selected_id(doc.phases[phase_index].events[event_index].id);
    };

    /**
     * 拖动卡片外边缘的宽度把手：改变该事件沿侧向的宽度。
     * render_side 是实际渲染的侧（开启交替分布时可能与 event.side 不同），
     * 它决定拖动方向是「变宽」还是「变窄」。
     */
    /** 阶段头宽度拖动：远离主轴方向拖大变宽 */
    const on_phase_width_down = (e: React.PointerEvent, phase_index: number) => {
        if (!edit_modeRef.current) return;
        const ph = docRef.current.phases[phase_index];
        if (!ph) return;
        const is_vertical = docRef.current.layout.direction === "vertical";
        const z = zoomRef.current;
        let start_w = ph.head_width ?? 0;
        if (!start_w) {
            const head_el = (e.currentTarget as HTMLElement).closest(".timeline-phase__head") as HTMLElement | null;
            if (head_el) start_w = head_el.getBoundingClientRect().width / z;
        }
        const origin = is_vertical ? e.clientX : e.clientY;
        const id = ph.id;
        const snapshot = stringify_doc(docRef.current);
        const on_move = (evt: PointerEvent) => {
            // 纵向时阶段头在主轴左侧，向左拖变宽
            let delta = ((is_vertical ? evt.clientX : evt.clientY) - origin) / z;
            if (is_vertical) delta = -delta;
            const w = Math.round(clamp_num(start_w + delta, MIN_EVENT_WIDTH, MAX_EVENT_WIDTH, start_w));
            const next = {
                ...docRef.current,
                phases: docRef.current.phases.map((p) => (p.id === id ? {...p, head_width: w} : p)),
            };
            // 同步更新 ref，保证松手时 snapshot 比较、保存都能拿到最新值
            docRef.current = next;
            setDoc(next);
        };
        const on_up = () => {
            document.removeEventListener("pointermove", on_move);
            document.removeEventListener("pointerup", on_up);
            if (snapshot !== stringify_doc(docRef.current)) {
                push_history(snapshot);
                mark_dirty(true);
            }
        };
        document.addEventListener("pointermove", on_move);
        document.addEventListener("pointerup", on_up);
    };

    const on_width_pointer_down = (
        e: React.PointerEvent,
        phase_index: number,
        event_index: number,
        render_side: TimelineSide,
    ) => {
        if (!edit_modeRef.current) return;
        const ev = docRef.current.phases[phase_index]?.events[event_index];
        if (!ev) return;
        const is_vertical = docRef.current.layout.direction === "vertical";
        const z = zoomRef.current;
        // 起始宽度：已显式设置过就用它，否则量一下当前实际宽度
        let start_w = ev.width ?? 0;
        if (!start_w) {
            const card_el = (e.currentTarget as HTMLElement).closest(".timeline-event") as HTMLElement | null;
            if (card_el) start_w = card_el.getBoundingClientRect().width / z;
        }
        const origin = is_vertical ? e.clientX : e.clientY;
        const id = ev.id;
        const snapshot = stringify_doc(docRef.current);
        const on_move = (evt: PointerEvent) => {
            let delta = ((is_vertical ? evt.clientX : evt.clientY) - origin) / z;
            // 左侧/上侧卡片往外拖是变宽，方向相反
            if (render_side === "left") delta = -delta;
            const w = Math.round(clamp_num(start_w + delta, MIN_EVENT_WIDTH, MAX_EVENT_WIDTH, start_w));
            const next = {
                ...docRef.current,
                phases: docRef.current.phases.map((p) => ({
                    ...p,
                    events: p.events.map((it) => (it.id === id ? {...it, width: w} : it)),
                })),
            };
            // 同步更新 ref，保证松手时 snapshot 比较、保存都能拿到最新值
            docRef.current = next;
            setDoc(next);
        };
        const on_up = () => {
            document.removeEventListener("pointermove", on_move);
            document.removeEventListener("pointerup", on_up);
            if (snapshot !== stringify_doc(docRef.current)) {
                push_history(snapshot);
                mark_dirty(true);
            }
        };
        document.addEventListener("pointermove", on_move);
        document.addEventListener("pointerup", on_up);
    };

    /**
     * 拖动连线上的把手：改变卡片到主轴的距离（连线长度）。
     * 往外拖变长、往里拖变短；左右侧方向相反。
     */
    const on_link_pointer_down = (
        e: React.PointerEvent,
        phase_index: number,
        event_index: number,
        render_side: TimelineSide,
    ) => {
        if (!edit_modeRef.current) return;
        const ev = docRef.current.phases[phase_index]?.events[event_index];
        if (!ev) return;
        const is_vertical = docRef.current.layout.direction === "vertical";
        const z = zoomRef.current;
        // 起始长度：已设置过就用它，否则用默认连线长度
        const start_len = ev.link_length ?? DEFAULT_LINK_LENGTH;
        const origin = is_vertical ? e.clientX : e.clientY;
        const id = ev.id;
        const snapshot = stringify_doc(docRef.current);
        const on_move = (evt: PointerEvent) => {
            let delta = ((is_vertical ? evt.clientX : evt.clientY) - origin) / z;
            // 左侧/上侧卡片往外拖（往左/上）是变长，方向相反
            if (render_side === "left") delta = -delta;
            const len = clamp_num(start_len + delta, MIN_LINK_LENGTH, MAX_LINK_LENGTH, start_len);
            const next = {
                ...docRef.current,
                phases: docRef.current.phases.map((p) => ({
                    ...p,
                    events: p.events.map((it) => (it.id === id ? {...it, link_length: len} : it)),
                })),
            };
            // 同步更新 ref，保证松手时 snapshot 比较、保存都能拿到最新值
            docRef.current = next;
            setDoc(next);
        };
        const on_up = () => {
            document.removeEventListener("pointermove", on_move);
            document.removeEventListener("pointerup", on_up);
            if (snapshot !== stringify_doc(docRef.current)) {
                push_history(snapshot);
                mark_dirty(true);
            }
        };
        document.addEventListener("pointermove", on_move);
        document.addEventListener("pointerup", on_up);
    };




    // ===================== 缩放：Ctrl + 滚轮 =====================

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const on_wheel = (e: WheelEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            const step = e.deltaY > 0 ? -0.1 : 0.1;
            set_zoom((z) => clamp_num(Number((z + step).toFixed(2)), MIN_ZOOM, MAX_ZOOM, 1));
        };
        el.addEventListener("wheel", on_wheel, {passive: false});
        return () => el.removeEventListener("wheel", on_wheel);
    }, []);

    // ===================== 文档操作 =====================

    /** 改布局配置（切换方向、节点/卡片/连线样式、颜色等） */
    const set_layout = (patch: Partial<TimelineLayout>) => {
        commit({...docRef.current, layout: {...docRef.current.layout, ...patch}});
    };

    /** 缩放：写进文档以便保存（只在编辑模式下持久化，非编辑模式仅本地预览） */
    const apply_zoom = (next: number) => {
        const z = clamp_num(Number(next.toFixed(2)), MIN_ZOOM, MAX_ZOOM, 1);
        set_zoom(z);
        if (edit_modeRef.current) set_layout({zoom: z});
    };

    const update_event = (id: string, patch: Partial<TimelineEvent>) => {
        commit({
            ...docRef.current,
            phases: docRef.current.phases.map((p) => ({
                ...p,
                events: p.events.map((e) => (e.id === id ? {...e, ...patch} : e)),
            })),
        });
    };

    const update_phase = (id: string, patch: Partial<TimelinePhase>) => {
        // 用 apply_any：折叠开关在视图模式下也要能按（文字输入被 readOnly 挡住）
        apply_any({
            ...docRef.current,
            phases: docRef.current.phases.map((p) => (p.id === id ? {...p, ...patch} : p)),
        });
    };

    const add_phase = () => {
        const idx = docRef.current.phases.length;
        commit({...docRef.current, phases: [...docRef.current.phases, new_phase(idx)]});
    };

    /** 在指定阶段的前面/后面插入新阶段 */
    const insert_phase = (phase_id: string, at: "before" | "after") => {
        const phases = docRef.current.phases;
        const i = phases.findIndex((p) => p.id === phase_id);
        if (i < 0) return;
        const pos = at === "before" ? i : i + 1;
        const next = [...phases];
        next.splice(pos, 0, new_phase(pos));
        apply_any({...docRef.current, phases: next});
    };

    /** 反转全部阶段顺序（首尾对调）：视图模式也能按，但只在编辑模式下才会被保存 */
    const reverse_phases = () => {
        const phases = [...docRef.current.phases].reverse();
        apply_any({...docRef.current, phases});
    };

    /** 阶段上移/下移一位（与相邻阶段交换顺序） */
    const move_phase = (id: string, dir: -1 | 1) => {
        const phases = [...docRef.current.phases];
        const i = phases.findIndex((p) => p.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= phases.length) return;
        [phases[i], phases[j]] = [phases[j], phases[i]];
        commit({...docRef.current, phases});
    };

    /** 事件在同阶段内上移/下移一位（位置由数组顺序决定） */
    const move_event = (id: string, dir: -1 | 1) => {
        commit({
            ...docRef.current,
            phases: docRef.current.phases.map((p) => {
                const i = p.events.findIndex((e) => e.id === id);
                const j = i + dir;
                if (i < 0 || j < 0 || j >= p.events.length) return p;
                const events = [...p.events];
                [events[i], events[j]] = [events[j], events[i]];
                return {...p, events};
            }),
        });
    };

    /** 在阶段头上按下：开始阶段拖动（顺序由拖动 useEffect 处理） */
    const on_phase_drag_start = (phase_index: number) => {
        if (!edit_modeRef.current) return;
        phase_dragRef.current = {from: phase_index, snapshot: stringify_doc(docRef.current)};
        set_drag_phase_id(docRef.current.phases[phase_index]?.id ?? null);
        document.body.classList.add("timeline-phase-dragging");
    };

    /** 新增事件：自动选择数量较少的一侧，让分布更均衡 */
    const add_event = (phase_id: string) => {
        const phase = docRef.current.phases.find((p) => p.id === phase_id);
        if (!phase) return;
        const left_n = phase.events.filter((e) => e.side === "left").length;
        const right_n = phase.events.length - left_n;
        const side: TimelineSide = left_n <= right_n ? "left" : "right";
        const created = new_event(side, 0.5);
        const phases = docRef.current.phases.map((p) =>
            p.id === phase_id ? {...p, events: [...p.events, created]} : p,
        );
        commit({...docRef.current, phases});
        set_selected_kind("event");
        set_selected_id(created.id);
    };

    const delete_event = (id: string) => {
        commit({
            ...docRef.current,
            phases: docRef.current.phases.map((p) => ({...p, events: p.events.filter((e) => e.id !== id)})),
        });
        set_selected_id((cur) => (cur === id ? null : cur));
    };

    /** 选中某个阶段（打开右侧阶段属性面板） */
    const select_phase = (id: string) => {
        set_selected_kind("phase");
        set_selected_id(id);
    };

    const delete_phase = (id: string) => {
        commit({...docRef.current, phases: docRef.current.phases.filter((p) => p.id !== id)});
        set_selected_id((cur) => (cur === id ? null : cur));
    };

    /** 一键折叠/展开所有阶段：视图模式也能按，但只在编辑模式下才会被保存 */
    const toggle_collapse_all = () => {
        const any_open = docRef.current.phases.some((p) => !p.collapsed);
        apply_any({
            ...docRef.current,
            phases: docRef.current.phases.map((p) => ({...p, collapsed: any_open})),
        });
    };

    /** 从读取地址里提取不带扩展名的文件名，用于导出命名 */
    const export_base_name = () => {
        const raw = latest.current.props.url ?? "";
        // 读取地址形如 /api/download?file=<编码路径>&token=...，文件名要从 file 参数取
        let path = raw;
        const q = raw.indexOf("?");
        if (q >= 0) {
            const params = new URLSearchParams(raw.slice(q + 1));
            path = params.get("file") || "";
        }
        if (!path) path = raw.split("?")[0];
        const last = path.split("/").filter(Boolean).pop() ?? "";
        let name = last;
        // file 参数可能被编码了两层，尽力解码
        for (let i = 0; i < 2; i++) {
            try {
                const decoded = decodeURIComponent(name);
                if (decoded === name) break;
                name = decoded;
            } catch {
                break;
            }
        }
        return name.replace(/\.timeline$/, "") || "timeline";
    };

    /** 导出 SVG */
    const export_svg = () => {
        const svg = doc_to_svg(docRef.current);
        const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = export_base_name() + ".svg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    /** 导出 PNG 图片：把 SVG 画到 canvas 再导出 */
    const export_png = () => {
        const svg = doc_to_svg(docRef.current);
        const svg_blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
        const url = URL.createObjectURL(svg_blob);
        const img = new Image();
        img.onload = () => {
            // 2 倍分辨率导出，保证清晰
            const scale = 2;
            const canvas = document.createElement("canvas");
            canvas.width = img.width * scale || 1200;
            canvas.height = img.height * scale || 800;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (!blob) return;
                    const png_url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = png_url;
                    a.download = export_base_name() + ".png";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(png_url);
                }, "image/png");
            }
            URL.revokeObjectURL(url);
        };
        img.onerror = () => {
            NotyFail(t("导出图片失败"));
            URL.revokeObjectURL(url);
        };
        img.src = url;
    };

    // 横向可滚动余量：纵向模式下，事件卡片往两侧伸出视口后仍要能滚回来。
    // 余量取「所有卡片相对视口中线的最大伸出量」，两侧对称设置以保证主轴仍居中。
    useEffect(() => {
        const el = innerRef.current;
        const canvas = scrollRef.current;
        if (!el || !canvas || doc.layout.direction !== "vertical") return;
        // 先清零余量再测量，避免上一次的 padding 影响卡片实际位置
        el.style.setProperty("--side-scroll", "0px");
        const half = canvas.clientWidth / 2;
        const cr = canvas.getBoundingClientRect();
        const mid = cr.left + half;
        let need = 0;
        el.querySelectorAll<HTMLElement>(".timeline-event").forEach((ev) => {
            const r = ev.getBoundingClientRect();
            need = Math.max(need, mid - r.left, r.right - mid);
        });
        // 留一点余量，避免卡片刚好贴边
        el.style.setProperty("--side-scroll", `${Math.max(120, Math.ceil(need) + 40)}px`);
        // 依赖只取影响卡片布局的字段：滚动位置变化不应触发重算，
        // 否则滚动时序号变化会改 padding、进而清掉刚记录的滚动位置
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc.phases, doc.layout.direction, doc.layout.card_style, doc.layout.node_style, zoom]);

    // ===================== 滚动位置持久化 =====================
    // 只在编辑模式下记录：视图模式是纯浏览，滚动不产生任何改动，也不标记 dirty。
    const scroll_save_timer = useRef<number>(0);
    const on_scroll = () => {
        if (!edit_modeRef.current) return;
        window.clearTimeout(scroll_save_timer.current);
        scroll_save_timer.current = window.setTimeout(() => {
            const el = scrollRef.current;
            if (!el) return;
            const x = Math.round(el.scrollLeft / zoomRef.current);
            const y = Math.round(el.scrollTop / zoomRef.current);
            const cur = docRef.current.layout;
            if (cur.scroll_x === x && cur.scroll_y === y) return;
            const next = {
                ...docRef.current,
                layout: {...cur, scroll_x: x, scroll_y: y},
            };
            docRef.current = next;
            setDoc(next);
            mark_dirty(true);
        }, 250);
    };

    // ===================== 快捷键 =====================
    useEffect(() => {
        const on_key = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            // 正在输入时不拦截任何快捷键，保证打字正常
            const typing =
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable);
            if (typing) return;
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && (e.key === "s" || e.key === "S")) {
                e.preventDefault();
                e.stopPropagation();
                save();
                return;
            }
            if (ctrl && (e.key === "z" || e.key === "Z")) {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) redo();
                else undo();
                return;
            }
            if (ctrl && (e.key === "y" || e.key === "Y")) {
                e.preventDefault();
                e.stopPropagation();
                redo();
                return;
            }
            if ((e.key === "Delete" || e.key === "Backspace") && selected_id && selected_kind === "event"
                && edit_modeRef.current) {
                e.preventDefault();
                delete_event(selected_id);
            }
        };
        document.addEventListener("keydown", on_key);
        return () => document.removeEventListener("keydown", on_key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected_id, selected_kind]);

    const find_event = (id: string): {event: TimelineEvent; phase: TimelinePhase} | null => {
        for (const p of doc.phases) {
            const e = p.events.find((it) => it.id === id);
            if (e) return {event: e, phase: p};
        }
        return null;
    };

    const selected = selected_kind === "event" && selected_id ? find_event(selected_id) : null;
    /** 选中的阶段（用于右侧阶段属性面板） */
    const selected_phase = selected_kind === "phase" && selected_id
        ? doc.phases.find((p) => p.id === selected_id) ?? null
        : null;
    const layout = doc.layout;
    /** 是否所有阶段都已折叠（用于切换「折叠/展开全部」按钮图标） */
    const all_collapsed = doc.phases.length > 0 && doc.phases.every((p) => p.collapsed);

    return (
        <div className={`timeline-wrap${props.fullscreen ? " timeline-wrap--full" : ""}${props.readonly ? " timeline-wrap--readonly" : ""}`}>
            {props.header}
            {/* 工具栏：只读嵌入（md 内联展示）时不显示 */}
            {!props.readonly && (
            <div className="timeline-toolbar">
                {/* 编辑模式开关：关闭时只读浏览，所有改动都不保存 */}
                <button type="button"
                        className={`timeline-btn${edit_mode ? " timeline-btn--on" : ""}`}
                        title={edit_mode ? t("退出编辑模式") : t("进入编辑模式")}
                        onClick={() => set_edit_mode((v) => !v)}>
                    <span className="material-icons">{edit_mode ? "edit" : "visibility"}</span>
                </button>
                {/* 折叠/展开全部：常驻 */}
                <button type="button" className="timeline-btn"
                        title={all_collapsed ? t("展开全部阶段") : t("折叠全部阶段")}
                        onClick={toggle_collapse_all}>
                    <span className="material-icons">{all_collapsed ? "unfold_more" : "unfold_less"}</span>
                </button>
                {/* 阶段倒置：全部阶段前后反转，视图模式也能按（仅编辑模式可保存） */}
                <button type="button" className="timeline-btn" title={t("阶段倒置")} onClick={reverse_phases}>
                    <span className="material-icons">swap_vert</span>
                </button>
                {edit_mode && <>
                    <button type="button" className="timeline-btn" title={t("添加阶段")} onClick={add_phase}>
                        <span className="material-icons">add_box</span>
                    </button>
                </>}
                <button type="button" className="timeline-btn" title={t("导出 SVG")} onClick={export_svg}>
                    <span className="material-icons">download</span>
                </button>
                <button type="button" className="timeline-btn" title={t("导出图片")} onClick={export_png}>
                    <span className="material-icons">image</span>
                </button>
                {edit_mode && <>
                <span className="timeline-toolbar__divider"/>
                {/* 方向切换：纵向 / 横向 */}
                <div className="timeline-seg">
                    <button type="button"
                            className={`timeline-seg__btn${vertical ? " timeline-seg__btn--on" : ""}`}
                            title={t("纵向")}
                            onClick={() => {
                                if (!vertical) set_layout({direction: "vertical"});
                            }}>
                        <span className="material-icons">swap_vert</span>
                    </button>
                    <button type="button"
                            className={`timeline-seg__btn${!vertical ? " timeline-seg__btn--on" : ""}`}
                            title={t("横向")}
                            onClick={() => {
                                if (vertical) set_layout({direction: "horizontal"});
                            }}>
                        <span className="material-icons">swap_horiz</span>
                    </button>
                </div>
                {/* 节点样式 */}
                <label className="timeline-toolbar__select" title={t("节点样式")}>
                    <span className="material-icons">radio_button_checked</span>
                    <select value={layout.node_style}
                            onChange={(e) => set_layout({node_style: e.target.value as TimelineNodeStyle})}>
                        <option value="dot">{t("圆点")}</option>
                        <option value="circle">{t("圆形")}</option>
                        <option value="square">{t("方形")}</option>
                        <option value="image">{t("图片")}</option>
                    </select>
                </label>
                {/* 卡片样式 */}
                <label className="timeline-toolbar__select" title={t("卡片样式")}>
                    <span className="material-icons">crop_square</span>
                    <select value={layout.card_style}
                            onChange={(e) => set_layout({card_style: e.target.value as TimelineCardStyle})}>
                        <option value="card">{t("卡片")}</option>
                        <option value="plain">{t("朴素")}</option>
                        <option value="bubble">{t("气泡")}</option>
                    </select>
                </label>
                {/* 连线风格 */}
                <label className="timeline-toolbar__select" title={t("连线风格")}>
                    <span className="material-icons">linear_scale</span>
                    <select value={layout.line_style}
                            onChange={(e) => set_layout({line_style: e.target.value as TimelineLineStyle})}>
                        <option value="solid">{t("实线")}</option>
                        <option value="dashed">{t("虚线")}</option>
                        <option value="dotted">{t("点线")}</option>
                    </select>
                </label>
                {/* 显示连线 */}
                <button type="button"
                        className={`timeline-btn${layout.show_connector ? " timeline-btn--on" : ""}`}
                        title={t("显示连线")}
                        onClick={() => set_layout({show_connector: !layout.show_connector})}>
                    <span className="material-icons">timeline</span>
                </button>
                </>}
                <span className="timeline-toolbar__gap"/>
                <button type="button" className="timeline-btn" title={t("撤销") + " (Ctrl+Z)"}
                        data-tick={history_tick}
                        disabled={undoRef.current.length === 0} onClick={undo}>
                    <span className="material-icons">undo</span>
                </button>
                <button type="button" className="timeline-btn" title={t("重做") + " (Ctrl+Y)"}
                        disabled={redoRef.current.length === 0} onClick={redo}>
                    <span className="material-icons">redo</span>
                </button>
                <span className="timeline-toolbar__zoom">{Math.round(zoom * 100)}%</span>
                <button type="button" className="timeline-btn" title={t("缩小")}
                        onClick={() => apply_zoom(zoom - 0.1)}>
                    <span className="material-icons">remove</span>
                </button>
                <button type="button" className="timeline-btn" title={t("放大")}
                        onClick={() => apply_zoom(zoom + 0.1)}>
                    <span className="material-icons">add</span>
                </button>
                <button type="button" className="timeline-btn" title={t("重置缩放")}
                        onClick={() => apply_zoom(1)}>
                    <span className="material-icons">restart_alt</span>
                </button>
            </div>
            )}
            {/* 主体：画布 + 属性面板 */}
            <div className="timeline-body">
                <div className={`timeline-canvas timeline-canvas--${layout.direction}`} ref={scrollRef}
                     onScroll={on_scroll}>
                    <div className="timeline-inner" ref={innerRef} style={{"--zoom": zoom} as React.CSSProperties}>
                        {/* 阶段拖动时的落点指示线 */}
                        {drop_pos !== null && (
                            <div className="timeline-drop"
                                 style={vertical ? {top: `${drop_pos}px`} : {left: `${drop_pos}px`}}/>
                        )}
                        {doc.phases.map((p, pi) => (
                            <PhaseBlock
                                key={p.id}
                                phase={p}
                                phase_index={pi}
                                layout={layout}
                                zoom={zoom}
                                vertical={vertical}
                                selected_id={selected_id}
                                on_event_down={on_event_pointer_down}
                                on_width_down={on_width_pointer_down}
                                on_link_down={on_link_pointer_down}
                                on_add_event={add_event}
                                on_delete_event={delete_event}
                                on_update_phase={update_phase}
                                on_delete_phase={delete_phase}
                                on_select_phase={select_phase}
                                head_height={head_heights[p.id]}
                                on_head_height={report_head_height}
                                on_phase_width_down={on_phase_width_down}
                                event_heights={event_heights}
                                on_event_height={report_event_height}
                                edit_mode={edit_mode}
                                on_phase_drag_start={on_phase_drag_start}
                                drag_phase_id={drag_phase_id}
                                t={t}
                            />
                        ))}
                    </div>
                </div>
                {/* 属性面板 */}
                {edit_mode && !props.readonly && selected_phase && (
                    <div className="timeline-panel">
                        <div className="timeline-panel__title">
                            <span className="material-icons">layers</span>
                            <span>{t("阶段")}</span>
                            <span className="material-icons timeline-panel__close"
                                  title={t("关闭")}
                                  onClick={() => set_selected_id(null)}>close</span>
                        </div>
                        <label className="timeline-panel__label">{t("名称")}</label>
                        <textarea className="timeline-panel__textarea" readOnly={!edit_mode} value={selected_phase.name}
                                  onChange={(e) => update_phase(selected_phase.id, {name: e.target.value})}/>
                        <label className="timeline-panel__label">{t("描述")}</label>
                        <textarea className="timeline-panel__textarea" readOnly={!edit_mode} value={selected_phase.desc ?? ""}
                                  onChange={(e) => update_phase(selected_phase.id, {desc: e.target.value})}/>
                        <label className="timeline-panel__label">{t("颜色")}</label>
                        <div className="timeline-panel__colors">
                            {TIMELINE_COLORS.map((c) => (
                                <span key={c} className="timeline-swatch" style={{background: c}}
                                      onClick={() => update_phase(selected_phase.id, {color: c})}/>
                            ))}
                            {/* 无级调色：原生取色器，可与左侧预设色板配合使用 */}
                            <label className="timeline-swatch timeline-swatch--pick" title={t("自定义颜色")}>
                                <input type="color" value={selected_phase.color || layout.axis_color}
                                       onChange={(e) => update_phase(selected_phase.id, {color: e.target.value})}/>
                            </label>
                        </div>
                        <label className="timeline-panel__label">{t("阶段头")}</label>
                        <div className="timeline-panel__seg">
                            <button type="button"
                                    className={`timeline-seg__btn${selected_phase.head_visible !== false ? " timeline-seg__btn--on" : ""}`}
                                    onClick={() => update_phase(selected_phase.id, {head_visible: true})}>
                                {t("显示")}
                            </button>
                            <button type="button"
                                    className={`timeline-seg__btn${selected_phase.head_visible === false ? " timeline-seg__btn--on" : ""}`}
                                    onClick={() => update_phase(selected_phase.id, {head_visible: false})}>
                                {t("隐藏")}
                            </button>
                        </div>
                        <div className="timeline-panel__hint">{t("拖动阶段头可调整顺序")}</div>
                        {/* 在当前阶段的前/后插入新阶段 */}
                        <div className="timeline-panel__insert">
                            <button type="button" className="timeline-panel__add"
                                    onClick={() => insert_phase(selected_phase.id, "before")}>
                                <span className="material-icons">vertical_align_top</span>
                                {t("在阶段前插入")}
                            </button>
                            <button type="button" className="timeline-panel__add"
                                    onClick={() => insert_phase(selected_phase.id, "after")}>
                                <span className="material-icons">vertical_align_bottom</span>
                                {t("在阶段后插入")}
                            </button>
                        </div>
                        <button type="button" className="timeline-panel__add"
                                onClick={() => add_event(selected_phase.id)}>
                            <span className="material-icons">add_circle</span>
                            {t("添加事件")}
                        </button>
                        {/* 阶段顺序调整 */}
                        <div className="timeline-panel__insert">
                            <button type="button" className="timeline-panel__add"
                                    onClick={() => move_phase(selected_phase.id, -1)}>
                                <span className="material-icons">arrow_upward</span>
                                {t("上移")}
                            </button>
                            <button type="button" className="timeline-panel__add"
                                    onClick={() => move_phase(selected_phase.id, 1)}>
                                <span className="material-icons">arrow_downward</span>
                                {t("下移")}
                            </button>
                        </div>
                        <button type="button" className="timeline-panel__del"
                                onClick={() => delete_phase(selected_phase.id)}>
                            <span className="material-icons">delete</span>
                            {t("删除阶段")}
                        </button>
                    </div>
                )}
                {edit_mode && !props.readonly && selected && (
                    <div className="timeline-panel">
                        <div className="timeline-panel__title">
                            <span className="material-icons">edit</span>
                            <span>{t("事件")}</span>
                            <span className="material-icons timeline-panel__close"
                                  title={t("关闭")}
                                  onClick={() => set_selected_id(null)}>close</span>
                        </div>
                        <label className="timeline-panel__label">{t("标题")}</label>
                        <input className="timeline-panel__input" value={selected.event.title}
                               onChange={(e) => update_event(selected.event.id, {title: e.target.value})}/>
                        <label className="timeline-panel__label">{t("描述")}</label>
                        <textarea className="timeline-panel__textarea" readOnly={!edit_mode} value={selected.event.desc ?? ""}
                                  onChange={(e) => update_event(selected.event.id, {desc: e.target.value})}/>
                        <label className="timeline-panel__label">{t("时间")}</label>
                        <div className="timeline-panel__times">
                            <input className="timeline-panel__input" value={selected.event.startTime ?? ""}
                                   placeholder={t("起始时间")}
                                   onChange={(e) => update_event(selected.event.id, {startTime: e.target.value})}/>
                            <input className="timeline-panel__input" value={selected.event.endTime ?? ""}
                                   placeholder={t("结束时间")}
                                   onChange={(e) => update_event(selected.event.id, {endTime: e.target.value})}/>
                        </div>
                        <label className="timeline-panel__label">{t("图片地址")}</label>
                        <input className="timeline-panel__input" value={selected.event.image ?? ""}
                               placeholder="https://..."
                               onChange={(e) => update_event(selected.event.id, {image: e.target.value})}/>
                        <label className="timeline-panel__label">{t("方向")}</label>
                        <div className="timeline-panel__seg">
                            <button type="button"
                                    className={`timeline-seg__btn${selected.event.side === "left" ? " timeline-seg__btn--on" : ""}`}
                                    onClick={() => update_event(selected.event.id, {side: "left"})}>
                                {vertical ? t("左侧") : t("上侧")}
                            </button>
                            <button type="button"
                                    className={`timeline-seg__btn${selected.event.side === "right" ? " timeline-seg__btn--on" : ""}`}
                                    onClick={() => update_event(selected.event.id, {side: "right"})}>
                                {vertical ? t("右侧") : t("下侧")}
                            </button>
                        </div>
                        <label className="timeline-panel__label">{t("颜色")}</label>
                        <div className="timeline-panel__colors">
                            <span className="timeline-swatch timeline-swatch--auto" title={t("跟随阶段")}
                                  onClick={() => update_event(selected.event.id, {color: ""})}/>
                            {TIMELINE_COLORS.map((c) => (
                                <span key={c} className="timeline-swatch" style={{background: c}}
                                      onClick={() => update_event(selected.event.id, {color: c})}/>
                            ))}
                            {/* 无级调色：原生取色器 */}
                            <label className="timeline-swatch timeline-swatch--pick" title={t("自定义颜色")}>
                                <input type="color" value={selected.event.color || selected_phase?.color || layout.axis_color}
                                       onChange={(e) => update_event(selected.event.id, {color: e.target.value})}/>
                            </label>
                        </div>
                        <div className="timeline-panel__hint">{t("用上移下移调整事件顺序，用左右切换事件所在侧")}</div>
                        {/* 事件在本阶段内的顺序调整 */}
                        <div className="timeline-panel__insert">
                            <button type="button" className="timeline-panel__add"
                                    onClick={() => move_event(selected.event.id, -1)}>
                                <span className="material-icons">arrow_upward</span>
                                {t("上移")}
                            </button>
                            <button type="button" className="timeline-panel__add"
                                    onClick={() => move_event(selected.event.id, 1)}>
                                <span className="material-icons">arrow_downward</span>
                                {t("下移")}
                            </button>
                        </div>
                        <button type="button" className="timeline-panel__del"
                                onClick={() => delete_event(selected.event.id)}>
                            <span className="material-icons">delete</span>
                            {t("删除事件")}
                        </button>
                    </div>
                )}
            </div>
            {loading && <div className="timeline-mask">Loading...</div>}
            {error && <div className="timeline-mask">{error}</div>}
        </div>
    );
}

/** 单个阶段区段：阶段头 + 事件卡片 + 沿轴拉伸把手 */
type PhaseBlockProps = {
    phase: TimelinePhase;
    /** 该阶段在文档 phases 中的下标（拖拽时用于定位） */
    phase_index: number;
    layout: TimelineLayout;
    zoom: number;
    /** 当前是否纵向 */
    vertical: boolean;
    selected_id: string | null;
    on_event_down: (e: React.PointerEvent, phase_index: number, event_index: number) => void;
    /** 拖动卡片宽度把手 */
    on_width_down: (e: React.PointerEvent, phase_index: number, event_index: number, side: TimelineSide) => void;
    /** 拖动连线长度把手 */
    on_link_down: (e: React.PointerEvent, phase_index: number, event_index: number, side: TimelineSide) => void;
    on_add_event: (phase_id: string) => void;
    on_delete_event: (id: string) => void;
    on_update_phase: (id: string, patch: Partial<TimelinePhase>) => void;
    on_delete_phase: (id: string) => void;
    /** 点击阶段（打开右侧阶段属性面板） */
    on_select_phase: (id: string) => void;
    /** 阶段头实测高度（px，zoom=1），用于折叠态间距 */
    head_height?: number;
    /** 上报阶段头高度 */
    on_head_height: (id: string, h: number) => void;
    /** 阶段头宽度调节把手按下 */
    on_phase_width_down: (e: React.PointerEvent, phase_index: number) => void;
    /** 各事件卡片实测高度（px，zoom=1） */
    event_heights: Record<string, number>;
    /** 上报事件卡片高度 */
    on_event_height: (id: string, h: number) => void;
    /** 是否编辑模式（非编辑模式只读） */
    edit_mode: boolean;
    /** 开始拖动阶段（交换顺序） */
    on_phase_drag_start: (phase_index: number) => void;
    /** 当前正在被拖动的阶段 id，用于高亮 */
    drag_phase_id: string | null;
    /** i18next 的 t 函数（类型较复杂，这里只需可调用） */
    t: any;
    /** 列表渲染时传入的 React key（同文件内定义的组件需显式声明） */
    key?: React.Key;
};

/** 阶段块：阶段头 + 事件卡片 + 折叠逻辑 */
function PhaseBlock(props: PhaseBlockProps) {
    const {phase, layout, zoom, vertical, selected_id, t} = props;
    const color = phase.color || layout.axis_color;
    const collapsed = !!phase.collapsed;
    const headRef = useRef<HTMLDivElement | null>(null);

    // 实测阶段头高度（换行后会变），上报给父组件用于计算折叠间距
    useLayoutEffect(() => {
        const el = headRef.current;
        if (!el || phase.head_visible === false) return;
        const report = () => props.on_head_height(phase.id, el.offsetHeight);
        report();
        const ro = new ResizeObserver(report);
        ro.observe(el);
        return () => ro.disconnect();
    }, [phase.id, phase.name, phase.desc, phase.head_visible]);

    /** 折叠态高度必须用阶段头实测高度，否则名称换行后各阶段会上下重合 */
    const head_px = props.head_height ?? PHASE_HEAD_SIZE;
    /** 阶段容器高度：折叠 = 头高；展开 = 同侧卡片实测高度累加 */
    const by_events = (() => {
        const GAP = 12;
        const axis_default = vertical ? EVENT_SLOT_SIZE : 240;
        const acc: Record<string, number> = {left: 0, right: 0};
        phase.events.forEach((e, ei) => {
            const side = layout.alternate ? (ei % 2 === 0 ? "left" : "right") : e.side;
            acc[side] += (props.event_heights[e.id] ?? axis_default) + GAP;
        });
        return HEAD_OFFSET + head_px + HEAD_GAP + Math.max(acc.left, acc.right);
    })();
    // 展开态高度以同侧卡片实测累加为准（by_events 里未测量到的事件才用固定槽位估算）
    const span = collapsed ? Math.max(PHASE_HEAD_SIZE, HEAD_OFFSET + head_px + HEAD_GAP) + 10 : by_events;
    // 阶段轴带 = 主轴本身：实线填色，虚线/点线用边框绘制
    const band_style: React.CSSProperties =
        layout.line_style === "solid"
            ? {background: color}
            : {borderColor: color, borderStyle: axis_border(layout.line_style)};

    return (
        <div className={`timeline-phase${collapsed ? " timeline-phase--collapsed" : ""}${props.drag_phase_id === phase.id ? " timeline-phase--dragging" : ""}`}
             style={vertical ? {height: `${span}px`} : {width: `${span}px`}}>
            {/* 阶段轴带：阶段之间首尾相接，拼成整条主轴；每段用自己阶段的颜色 */}
            <div className="timeline-phase__band" style={band_style}/>
            {/* 阶段头：可通过属性面板隐藏，隐藏后只剩轴上的色带 */}
            {phase.head_visible !== false && (
            <div className="timeline-phase__head"
                 ref={headRef}
                 style={{borderColor: color, ...(phase.head_width ? {width: phase.head_width, maxWidth: "none"} : {})}}
                 onPointerDown={(e) => {
                     // 点操作图标/拖动/折叠时不切换选中，其余位置都选中阶段
                     const target = e.target as HTMLElement;
                     if (target.closest(".timeline-phase__op") || target.closest(".timeline-phase__drag")
                         || target.closest(".timeline-phase__toggle")) return;
                     props.on_select_phase(phase.id);
                 }}>
                <span className="material-icons timeline-phase__drag"
                      title={t("拖动排序")}
                      onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          props.on_phase_drag_start(props.phase_index);
                      }}>drag_indicator</span>
                <span className="material-icons timeline-phase__toggle"
                      title={collapsed ? t("展开") : t("折叠")}
                      onClick={() => props.on_update_phase(phase.id, {collapsed: !collapsed})}>
                    {collapsed ? "expand_more" : "expand_less"}
                </span>
                <div className="timeline-phase__name" style={{color}} title={phase.name}>
                    {phase.name}
                </div>
                {phase.desc && (
                    <div className="timeline-phase__desc" title={phase.desc}>{phase.desc}</div>
                )}
                {/* 宽度调节把手：拖动改变阶段头宽度（远离主轴的那条外边缘） */}
                <div className="timeline-phase__width" data-phase-width={phase.id}
                     title={t("拖动调整宽度")}
                     onPointerDown={(e) => {
                         e.stopPropagation();
                         e.preventDefault();
                         props.on_phase_width_down(e, props.phase_index);
                     }}/>
            </div>
            )}
            {!collapsed && (
                <>
                    {/* 阶段头被隐藏时，在轴上提供一个恢复入口 */}
                    {phase.head_visible === false && (
                        <span className="material-icons timeline-phase__show-head"
                              title={t("显示阶段头")}
                              onClick={() => props.on_update_phase(phase.id, {head_visible: true})}>visibility</span>
                    )}
                    {/* 事件卡片：沿轴按 offset 定位，按 side 决定挂哪一侧。
                        开启「两侧交替」时忽略各自的 side，按顺序左右/上下轮流分布。
                        同一侧的相邻卡片按实测高度依次排开，避免内容变高后上下重叠。 */}
                    {(() => {
                        // 与下方 map 一致的 side 判定，供布局预计算使用
                        const side_of = (ei: number): TimelineSide =>
                            layout.alternate ? (ei % 2 === 0 ? "left" : "right") : phase.events[ei].side;
                        // 卡片沿轴实测尺寸（纵向=高度/横向=宽度）；未测到时给保守默认值
                        const axis_default = vertical ? EVENT_SLOT_SIZE : 240;
                        const size_of = (id: string) => props.event_heights[id] ?? axis_default;
                        const GAP = 12;
                        // 每一侧依次累加：本卡片的沿轴位置 = 同侧前序卡片高度之和
                        const cursor: Record<string, number> = {left: 0, right: 0};
                        const along: number[] = phase.events.map((e, ei) => {
                            const s = side_of(ei);
                            const at = cursor[s];
                            cursor[s] = at + size_of(e.id) + GAP;
                            return at;
                        });
                        return phase.events.map((e, ei) => {
                            const side = side_of(ei);
                            // 沿轴位置：阶段头高度 + 头部偏移 + 同侧前序累加
                            const pos = HEAD_OFFSET + head_px + HEAD_GAP + along[ei];
                            // 节点中心 = 卡片沿轴起点 + 卡片沿轴尺寸的一半（节点恒在卡片沿轴中心）
                            const node_center = pos + size_of(e.id) / 2;
                            const node_style = layout.node_style;
                            return (
                            <React.Fragment key={e.id}>
                                {/* 时间独立挂在阶段容器上：start 恒在轴左、end 恒在轴右，
                                    不随卡片挂哪一侧变化；水平紧贴节点边缘，沿轴分列节点前后。
                                    带上节点样式类是为了拿到 --node-r（节点半径）。 */}
                                {e.startTime && (
                                    <div className={`timeline-event__time timeline-event__time--start timeline-event--node-${node_style}`}
                                         style={vertical ? {top: node_center} : {left: node_center}}>{e.startTime}</div>
                                )}
                                {e.endTime && (
                                    <div className={`timeline-event__time timeline-event__time--end timeline-event--node-${node_style}`}
                                         style={vertical ? {top: node_center} : {left: node_center}}>{e.endTime}</div>
                                )}
                                <EventBubble
                                    event={e}
                                    phase={phase}
                                    layout={layout}
                                    vertical={vertical}
                                    zoom={zoom}
                                    side={side}
                                    along={along[ei]}
                                    head_size={head_px}
                                    on_height={(h) => props.on_event_height(e.id, h)}
                                    event_index={ei}
                                    phase_index={props.phase_index}
                                    selected={selected_id === e.id}
                                    on_down={props.on_event_down}
                                    on_width_down={props.on_width_down}
                                    on_link_down={props.on_link_down}
                                    on_delete={props.on_delete_event}
                                    t={t}
                                />
                            </React.Fragment>
                            );
                        });
                    })()}
                </>
            )}
        </div>
    );
}

/** 单条事件卡片：offset 决定沿轴位置，side 决定挂在哪一侧 */
type EventBubbleProps = {
    event: TimelineEvent;
    phase: TimelinePhase;
    layout: TimelineLayout;
    vertical: boolean;
    zoom: number;
    /** 实际渲染的侧（交替模式下由索引决定，不一定等于 event.side） */
    side: TimelineSide;
    /** 沿轴位置（px，zoom 前）：同侧前序卡片高度累加而来，避免上下重叠 */
    along: number;
    /** 阶段头实测厚度（px，zoom 前）：卡片沿轴起点要跳过它，避免压住阶段头 */
    head_size?: number;
    /** 上报卡片实测高度（px，zoom 前），供同侧排布使用 */
    on_height?: (h: number) => void;
    event_index: number;
    phase_index: number;
    selected: boolean;
    on_down: (e: React.PointerEvent, phase_index: number, event_index: number) => void;
    /** 拖动卡片宽度把手 */
    on_width_down: (e: React.PointerEvent, phase_index: number, event_index: number, side: TimelineSide) => void;
    /** 拖动连线长度把手 */
    on_link_down: (e: React.PointerEvent, phase_index: number, event_index: number, side: TimelineSide) => void;
    on_delete: (id: string) => void;
    /** i18next 的 t 函数（类型较复杂，这里只需可调用） */
    t: any;
    /** 列表渲染时传入的 React key（同文件内定义的组件需显式声明） */
    key?: React.Key;
};

function EventBubble(props: EventBubbleProps) {
    const {event, phase, layout, vertical, zoom, side, selected, t} = props;
    const color = event.color || phase.color || layout.axis_color;
    const rootRef = useRef<HTMLDivElement | null>(null);

    // 上报卡片沿轴方向的实测尺寸（纵向=高度，横向=宽度），
    // 父级据此把同侧卡片依次排开，避免内容变长后重叠
    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el || !props.on_height) return;
        const vertical = layout.direction === "vertical";
        const report = () => {
            const r = el.getBoundingClientRect();
            const size = Math.round((vertical ? r.height : r.width) / zoom);
            if (size > 0) props.on_height!(size);
        };
        report();
        const ro = new ResizeObserver(report);
        ro.observe(el);
        const timer = window.setTimeout(report, 300);
        return () => {
            ro.disconnect();
            window.clearTimeout(timer);
        };
    }, [event.title, event.desc, event.image, event.width, zoom, layout.direction, props.on_height]);

    /**
     * 沿轴位置 = 阶段头厚度（用实测高度，避免阶段头换行后压住第一张卡片）
     * + 同侧前序卡片高度（zoom 前），整体按 zoom 缩放。
     * 纵向时映射到 top，横向时映射到 left。
     * HEAD_OFFSET 对应 CSS 中阶段头的 top/bottom 偏移（.3rem），
     * 再加 .3rem 安全间距，保证卡片不贴也不压阶段头。
     */
    const pos = `${HEAD_OFFSET + (props.head_size ?? PHASE_HEAD_SIZE) + HEAD_GAP + props.along}px`;
    /**
     * 样式变量：
     *  --side-gap    卡片到主轴的距离（连线长度），未设置时用 CSS 默认值
     *  --ev-color    当前事件的主题色
     * 沿轴位置由内联样式给出（纵向映射到 top，横向映射到 left）；
     * 侧向位置完全交给 CSS 类（--side-left / --side-right）处理，避免互相覆盖。
     */
    const vars: React.CSSProperties = {["--ev-color" as any]: color};
    if (event.link_length != null) {
        (vars as any)["--side-gap"] = `${event.link_length}px`;
    }
    const style: React.CSSProperties = vertical ? {top: pos} : {left: pos};
    if (event.width) {
        style.width = `${event.width}px`;
    }

    return (
        <div className={`timeline-event timeline-event--${layout.card_style} timeline-event--side-${side}`
            + ` timeline-event--node-${layout.node_style}`
            + (selected ? " timeline-event--on" : "")
            + (layout.show_connector ? " timeline-event--linked" : "")}
             ref={rootRef}
             style={{...style, ...vars, borderColor: color}}
             onPointerDown={(e) => props.on_down(e, props.phase_index, props.event_index)}
        >
            {/* 连线：从卡片指向主轴 */}
            {layout.show_connector && <div className="timeline-event__link"
                                           style={{borderColor: color, borderStyle: layout.line_style}}/>}
            {/* 节点：放在轴上，由 CSS 定位到主轴处 */}
            <div className={`timeline-node ${node_class(layout.node_style)}`}
                 style={{background: layout.node_style === "image" && event.image ? "transparent" : color}}>
                {layout.node_style === "image" && event.image
                    ? <img src={event.image} alt=""/>
                    : null}
            </div>
            <div className="timeline-event__body">
                <div className="timeline-event__title" style={{color}}>{event.title || t("未命名")}</div>
                {event.desc && <div className="timeline-event__desc">{event.desc}</div>}
            </div>
            {/* 卡片外边缘的宽度调节把手：拖动改变卡片沿侧向的宽度 */}
            <div className="timeline-event__width" data-event-width={event.id}
                 title={t("拖动调整卡片宽度")}
                 onPointerDown={(e) => {
                     // 阻止冒泡到卡片本体，避免同时触发卡片拖拽
                     e.stopPropagation();
                     e.preventDefault();
                     props.on_width_down(e, props.phase_index, props.event_index, side);
                 }}/>
            {/* 连线上的长度调节把手：拖动改变卡片到主轴的距离 */}
            {layout.show_connector && (
                <div className="timeline-event__link-handle" data-event-link={event.id}
                     title={t("拖动调整连线长度")}
                     onPointerDown={(e) => {
                         e.stopPropagation();
                         e.preventDefault();
                         props.on_link_down(e, props.phase_index, props.event_index, side);
                     }}/>
            )}
            <span className="material-icons timeline-event__del" title={t("删除事件")}
                  onClick={(e) => {
                      e.stopPropagation();
                      props.on_delete(event.id);
                  }}>close</span>
        </div>
    );
}
