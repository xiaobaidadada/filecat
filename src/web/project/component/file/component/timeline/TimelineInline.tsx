import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Http} from "../../../../util/http";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {useTranslation} from "react-i18next";
import {
    DEFAULT_LINK_LENGTH,
    DEFAULT_PHASE_SIZE,
    MAX_EVENT_WIDTH,
    MAX_LINK_LENGTH,
    MAX_PHASE_SIZE,
    MAX_ZOOM,
    MIN_EVENT_WIDTH,
    MIN_LINK_LENGTH,
    MIN_PHASE_SIZE,
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
    sort_events_by_date,
    stringify_doc,
} from "./timeline_util";

/**
 * 时间轴编辑器（.timeline）。
 *
 * 一套数据、两种方向：
 *  - 纵向（默认）：主轴竖直，阶段自上而下排布，事件挂在左右两侧，上下两端把手可无限拉伸
 *  - 横向：主轴水平，阶段自左而右排布，事件挂在上下两侧，左右两端把手可无限拉伸
 * 事件可拖动改变「沿轴位置」与「所属侧」；阶段可在轴向上独立拉伸；卡片宽度也可拖动调整。
 */

export type TimelineHandle = {
    /** 立即保存，返回是否成功 */
    save: () => Promise<boolean>;
    /** 是否有未保存的改动 */
    is_dirty: () => boolean;
};

type Props = {
    /** 读取内容的地址 */
    url?: string;
    /** 切换文件时用于重建编辑器的 key */
    reset_key?: string;
    /** 保存实现：由外壳决定写到哪 */
    on_save: (context: string) => Promise<boolean>;
    on_dirty?: (dirty: boolean) => void;
    register?: (handle: TimelineHandle) => void;
    /** 顶部额外内容（如全屏外壳的文件名、保存、关闭按钮） */
    header?: React.ReactNode;
    /** 是否为全屏浮层模式（影响容器样式类名） */
    fullscreen?: boolean;
};

/** 事件在文档中的定位 */
type EventLoc = {phase_index: number; event_index: number};

/**
 * 阶段头沿轴方向的厚度（px，zoom=1）。
 * 事件在阶段内的可用区域要扣掉它，需与 CSS 中 .timeline-phase__head 保持一致。
 */
const PHASE_HEAD_SIZE = 36;

/** 两端把手的样式：纵向时是上下条，横向时是左右条 */
function pad_style(size: number, vertical: boolean): React.CSSProperties {
    if (vertical) {
        return {height: `${size}px`, width: "100%"};
    }
    return {width: `${size}px`, height: "100%"};
}

/** 对齐辅助线样式：纵向时是水平线（跨侧向），横向时是垂直线 */
function guide_style(pos: number, vertical: boolean, color: string): React.CSSProperties {
    if (vertical) {
        return {top: `${pos}px`, borderTop: `1px dashed ${color}`};
    }
    return {left: `${pos}px`, borderLeft: `1px dashed ${color}`};
}

/** 节点样式对应的 CSS 类名后缀 */
function node_class(style: TimelineNodeStyle): string {
    return `timeline-node--${style}`;
}

export default function TimelineEditor(props: Props) {
    const {t} = useTranslation();
    const [doc, setDoc] = useState<TimelineDoc>(() => default_doc());
    const [loading, setLoading] = useState(true);
    const [error, set_error] = useState("");
    const [zoom, set_zoom] = useState(1);
    /** 选中的事件 id（用于右侧属性面板） */
    const [selected_id, set_selected_id] = useState<string | null>(null);
    /** 拖拽时的对齐辅助线位置（px，相对 timeline-inner；null 表示不显示） */
    const [guide, set_guide] = useState<number | null>(null);

    const innerRef = useRef<HTMLDivElement | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const dirtyRef = useRef(false);
    const latest = useRef({props});
    latest.current = {props};

    // 撤销/重做：保存 JSON 快照
    const undoRef = useRef<string[]>([]);
    const redoRef = useRef<string[]>([]);
    const [history_tick, set_history_tick] = useState(0);

    const dragRef = useRef<{moved: boolean} | null>(null);
    const dragLocRef = useRef<EventLoc | null>(null);
    const pendingRef = useRef<TimelineDoc | null>(null);
    const drag_snapshotRef = useRef<string | null>(null);

    const docRef = useRef<TimelineDoc>(doc);
    docRef.current = doc;
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    /** 当前是否纵向 */
    const vertical = doc.layout.direction === "vertical";

    /** 标记内容变更 */
    const mark_dirty = (dirty: boolean) => {
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

    /** 结构性变更：记入撤销栈 */
    const commit = useCallback(
        (next: TimelineDoc) => {
            push_history(stringify_doc(docRef.current));
            setDoc(next);
            mark_dirty(true);
        },
        [push_history],
    );

    const undo = useCallback(() => {
        const prev = undoRef.current.pop();
        if (prev == null) return;
        redoRef.current.push(stringify_doc(docRef.current));
        setDoc(normalize_doc(JSON.parse(prev)));
        set_selected_id(null);
        mark_dirty(true);
        set_history_tick((v) => v + 1);
    }, []);

    const redo = useCallback(() => {
        const next = redoRef.current.pop();
        if (next == null) return;
        undoRef.current.push(stringify_doc(docRef.current));
        setDoc(normalize_doc(JSON.parse(next)));
        set_selected_id(null);
        mark_dirty(true);
        set_history_tick((v) => v + 1);
    }, []);

    const save = async (): Promise<boolean> => {
        const ok = await latest.current.props.on_save(stringify_doc(docRef.current));
        if (ok) mark_dirty(false);
        return ok;
    };

    useEffect(() => {
        props.register?.({save, is_dirty: () => dirtyRef.current});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.register]);

    // 加载文件内容
    useEffect(() => {
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
                setDoc(parse_doc(raw) ?? default_doc());
            } catch {
                if (cancelled) return;
                set_error(t("加载时间轴失败"));
                NotyFail(t("加载时间轴失败"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.url]);

    /** 每个阶段沿轴方向的起点（折叠阶段按固定头厚计） */
    const phase_offsets = useMemo(() => {
        const list: number[] = [];
        let acc = 0;
        for (const p of doc.phases) {
            list.push(acc);
            acc += p.collapsed ? PHASE_HEAD_SIZE : phase_size(p);
        }
        return list;
    }, [doc.phases]);

    /** 某阶段沿轴占用的尺寸（折叠时只剩头） */
    const phase_span = (p: TimelinePhase) => (p.collapsed ? PHASE_HEAD_SIZE : phase_size(p));

    // ===================== 事件拖拽 =====================

    /**
     * 根据鼠标位置计算事件新的归属阶段与位置。
     * 横向时把 clientX 当作「沿轴」、clientY 当作「侧向」，纵向时相反。
     */
    const handle_event_drag = useCallback(
        (client_x: number, client_y: number) => {
            const loc = dragLocRef.current;
            const el = innerRef.current;
            if (!loc || !el) return;
            const rect = el.getBoundingClientRect();
            const z = zoomRef.current;
            // 拖拽期间以「上一次移动后的待定文档」为准，避免 setDoc 尚未渲染导致
            // docRef 与 dragLocRef 指向不一致而错删/错移事件。
            const cur = pendingRef.current ?? docRef.current;
            const is_vertical = cur.layout.direction === "vertical";
            // 沿轴方向 / 侧向的本地逻辑坐标（屏幕坐标 / 缩放）
            const local_along = (is_vertical ? client_y - rect.top : client_x - rect.left) / z;
            const local_side = (is_vertical ? client_x - rect.left : client_y - rect.top) / z;
            // 轴所在的侧向位置（取容器侧向尺寸的中点）
            const side_size = (is_vertical ? el.offsetWidth : el.offsetHeight) / z;
            const axis_side = side_size / 2;
            const phases = cur.phases;

            // 定位目标阶段：沿轴落在哪个区间就归哪个
            let target = phases.length - 1;
            for (let i = 0; i < phases.length; i++) {
                const start = phase_offsets[i];
                if (local_along <= start + phase_span(phases[i])) {
                    target = i;
                    break;
                }
            }
            const phase = phases[target];
            if (!phase || phase.collapsed) return;

            const start = phase_offsets[target];
            const span = phase_span(phase);
            // 可用区域扣除阶段头
            const usable = Math.max(1, span - PHASE_HEAD_SIZE);
            const offset = clamp_num((local_along - start - PHASE_HEAD_SIZE) / usable, 0, 1, 0.5);
            const side: TimelineSide = local_side < axis_side ? "left" : "right";

            const moving = phases[loc.phase_index].events[loc.event_index];
            if (!moving) return;
            const updated: TimelineEvent = {...moving, offset, side};

            let next: TimelineDoc;
            if (loc.phase_index === target) {
                // 同一阶段内拖动：原地更新，避免事件在数组中反复搬家导致顺序错乱
                const idx = loc.event_index;
                next = {
                    ...cur,
                    phases: phases.map((p, pi) =>
                        pi === target
                            ? {...p, events: p.events.map((e, ei) => (ei === idx ? updated : e))}
                            : p,
                    ),
                };
            } else {
                // 跨阶段拖动：从原阶段移除，追加到目标阶段
                next = {
                    ...cur,
                    phases: phases.map((p, pi) => {
                        if (pi === loc.phase_index) {
                            return {...p, events: p.events.filter((_, ei) => ei !== loc.event_index)};
                        }
                        if (pi === target) {
                            return {...p, events: [...p.events, updated]};
                        }
                        return p;
                    }),
                };
                const ni = next.phases[target].events.findIndex((e) => e.id === updated.id);
                dragLocRef.current = {phase_index: target, event_index: ni};
            }
            pendingRef.current = next;
            // 对齐辅助线：落在事件中心
            set_guide((start + PHASE_HEAD_SIZE + offset * usable) * z);
        },
        [phase_offsets],
    );

    // 拖拽事件：统一挂 document，鼠标移出元素也能继续
    useEffect(() => {
        const on_move = (e: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            drag.moved = true;
            handle_event_drag(e.clientX, e.clientY);
            if (pendingRef.current) setDoc(pendingRef.current);
        };
        const on_up = () => {
            const drag = dragRef.current;
            if (!drag) return;
            dragRef.current = null;
            dragLocRef.current = null;
            pendingRef.current = null;
            set_guide(null);
            // 拖拽结束：把拖拽前的快照补进撤销栈
            if (drag.moved && drag_snapshotRef.current != null) {
                push_history(drag_snapshotRef.current);
                mark_dirty(true);
            }
            drag_snapshotRef.current = null;
        };
        document.addEventListener("pointermove", on_move);
        document.addEventListener("pointerup", on_up);
        document.addEventListener("pointercancel", on_up);
        return () => {
            document.removeEventListener("pointermove", on_move);
            document.removeEventListener("pointerup", on_up);
            document.removeEventListener("pointercancel", on_up);
        };
    }, [handle_event_drag, push_history]);

    /** 在事件卡片上按下：开始拖拽 */
    const on_event_pointer_down = (e: React.PointerEvent, phase_index: number, event_index: number) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        // 点在输入框/按钮/宽度把手上不启动卡片拖拽，避免误触发
        if (target.closest("input, textarea, button, select, [data-event-width], [data-event-link]")) return;
        e.stopPropagation();
        set_selected_id(doc.phases[phase_index].events[event_index].id);
        dragRef.current = {moved: false};
        dragLocRef.current = {phase_index, event_index};
        drag_snapshotRef.current = stringify_doc(docRef.current);
        pendingRef.current = null;
    };

    /**
     * 拖动卡片外边缘的宽度把手：改变该事件沿侧向的宽度。
     * render_side 是实际渲染的侧（开启交替分布时可能与 event.side 不同），
     * 它决定拖动方向是「变宽」还是「变窄」。
     */
    const on_width_pointer_down = (
        e: React.PointerEvent,
        phase_index: number,
        event_index: number,
        render_side: TimelineSide,
    ) => {
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
            const w = clamp_num(start_w + delta, MIN_EVENT_WIDTH, MAX_EVENT_WIDTH, start_w);
            setDoc((d) => ({
                ...d,
                phases: d.phases.map((p) => ({
                    ...p,
                    events: p.events.map((it) => (it.id === id ? {...it, width: w} : it)),
                })),
            }));
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
            setDoc((d) => ({
                ...d,
                phases: d.phases.map((p) => ({
                    ...p,
                    events: p.events.map((it) => (it.id === id ? {...it, link_length: len} : it)),
                })),
            }));
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

    useEffect(() => {
        let pad: {side: "start" | "end"; origin: number; start_val: number} | null = null;
        let snapshot: string | null = null;
        const on_down = (e: PointerEvent) => {
            // 从实际点击的元素向上找最近的带 data-pad 的容器，
            // 这样点在箭头图标或提示文字上也能正常开始拖动。
            const holder = (e.target as HTMLElement)?.closest?.("[data-pad]") as HTMLElement | null;
            const side = holder?.dataset?.pad as "start" | "end" | undefined;
            if (!side) return;
            e.preventDefault();
            const is_vertical = docRef.current.layout.direction === "vertical";
            snapshot = stringify_doc(docRef.current);
            pad = {
                side,
                origin: is_vertical ? e.clientY : e.clientX,
                start_val: side === "start" ? docRef.current.pad.start : docRef.current.pad.end,
            };
        };
        const on_move = (e: PointerEvent) => {
            if (!pad) return;
            const is_vertical = docRef.current.layout.direction === "vertical";
            const z = zoomRef.current;
            const delta = ((is_vertical ? e.clientY : e.clientX) - pad.origin) / z;
            // 起始端把手：往外（上/左）拖是加长，所以取反；
            // 结束端把手：往外（下/右）拖是加长，方向一致。
            const signed = pad.side === "start" ? -delta : delta;
            const val = Math.max(0, pad.start_val + signed);
            const which = pad.side;
            setDoc((d) => ({...d, pad: {...d.pad, [which]: val}}));
        };
        const on_up = () => {
            if (!pad) return;
            pad = null;
            if (snapshot != null && snapshot !== stringify_doc(docRef.current)) {
                push_history(snapshot);
                mark_dirty(true);
            }
            snapshot = null;
        };
        document.addEventListener("pointerdown", on_down);
        document.addEventListener("pointermove", on_move);
        document.addEventListener("pointerup", on_up);
        return () => {
            document.removeEventListener("pointerdown", on_down);
            document.removeEventListener("pointermove", on_move);
            document.removeEventListener("pointerup", on_up);
        };
    }, [push_history]);

    // ===================== 阶段沿轴拉伸 =====================

    useEffect(() => {
        let resize: {id: string; origin: number; start_size: number} | null = null;
        let snapshot: string | null = null;
        const on_down = (e: PointerEvent) => {
            const id = (e.target as HTMLElement)?.dataset?.phaseResize;
            if (!id) return;
            const p = docRef.current.phases.find((it) => it.id === id);
            if (!p || p.collapsed) return;
            e.preventDefault();
            e.stopPropagation();
            const is_vertical = docRef.current.layout.direction === "vertical";
            snapshot = stringify_doc(docRef.current);
            resize = {
                id,
                origin: is_vertical ? e.clientY : e.clientX,
                start_size: phase_size(p),
            };
        };
        const on_move = (e: PointerEvent) => {
            if (!resize) return;
            const is_vertical = docRef.current.layout.direction === "vertical";
            const z = zoomRef.current;
            const delta = ((is_vertical ? e.clientY : e.clientX) - resize.origin) / z;
            const size = clamp_num(
                resize.start_size + delta,
                MIN_PHASE_SIZE,
                MAX_PHASE_SIZE,
                DEFAULT_PHASE_SIZE,
            );
            const id = resize.id;
            setDoc((d) => ({
                ...d,
                phases: d.phases.map((p) => (p.id === id ? {...p, size} : p)),
            }));
        };
        const on_up = () => {
            if (!resize) return;
            resize = null;
            if (snapshot != null && snapshot !== stringify_doc(docRef.current)) {
                push_history(snapshot);
                mark_dirty(true);
            }
            snapshot = null;
        };
        document.addEventListener("pointerdown", on_down);
        document.addEventListener("pointermove", on_move);
        document.addEventListener("pointerup", on_up);
        return () => {
            document.removeEventListener("pointerdown", on_down);
            document.removeEventListener("pointermove", on_move);
            document.removeEventListener("pointerup", on_up);
        };
    }, [push_history]);

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
        commit({
            ...docRef.current,
            phases: docRef.current.phases.map((p) => (p.id === id ? {...p, ...patch} : p)),
        });
    };

    const add_phase = () => {
        const idx = docRef.current.phases.length;
        commit({...docRef.current, phases: [...docRef.current.phases, new_phase(idx)]});
    };

    const delete_phase = (id: string) => {
        commit({...docRef.current, phases: docRef.current.phases.filter((p) => p.id !== id)});
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
        set_selected_id(created.id);
    };

    const delete_event = (id: string) => {
        commit({
            ...docRef.current,
            phases: docRef.current.phases.map((p) => ({...p, events: p.events.filter((e) => e.id !== id)})),
        });
        set_selected_id((cur) => (cur === id ? null : cur));
    };

    /** 按日期排序：重排每个阶段内的事件顺序 */
    const sort_by_date = () => {
        commit({
            ...docRef.current,
            phases: docRef.current.phases.map((p) => ({...p, events: sort_events_by_date(p.events)})),
        });
        NotySuccess(t("已按日期排序"));
    };

    /** 导出 SVG */
    const export_svg = () => {
        const svg = doc_to_svg(docRef.current);
        const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const base = (latest.current.props.url ?? "").split("?")[0].split("/").pop() ?? "timeline";
        a.download = base.replace(/\.timeline$/, "") + ".svg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
            if ((e.key === "Delete" || e.key === "Backspace") && selected_id) {
                e.preventDefault();
                delete_event(selected_id);
            }
        };
        document.addEventListener("keydown", on_key);
        return () => document.removeEventListener("keydown", on_key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected_id]);

    const find_event = (id: string): {event: TimelineEvent; phase: TimelinePhase} | null => {
        for (const p of doc.phases) {
            const e = p.events.find((it) => it.id === id);
            if (e) return {event: e, phase: p};
        }
        return null;
    };

    const selected = selected_id ? find_event(selected_id) : null;
    const layout = doc.layout;
    const axis_border = layout.line_style === "solid" ? "solid" : layout.line_style;

    return (
        <div className={`timeline-wrap${props.fullscreen ? " timeline-wrap--full" : ""}`}>
            {props.header}
            {/* 工具栏 */}
            <div className="timeline-toolbar">
                <button type="button" className="timeline-btn" title={t("添加阶段")} onClick={add_phase}>
                    <span className="material-icons">add_box</span>
                </button>
                <button type="button" className="timeline-btn" title={t("按日期排序")} onClick={sort_by_date}>
                    <span className="material-icons">sort</span>
                </button>
                <button type="button" className="timeline-btn" title={t("导出 SVG")} onClick={export_svg}>
                    <span className="material-icons">download</span>
                </button>
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
                {/* 两侧交替分布 */}
                <button type="button"
                        className={`timeline-btn${layout.alternate ? " timeline-btn--on" : ""}`}
                        title={t("两侧交替分布")}
                        onClick={() => set_layout({alternate: !layout.alternate})}>
                    <span className="material-icons">compare_arrows</span>
                </button>
                {/* 显示连线 */}
                <button type="button"
                        className={`timeline-btn${layout.show_connector ? " timeline-btn--on" : ""}`}
                        title={t("显示连线")}
                        onClick={() => set_layout({show_connector: !layout.show_connector})}>
                    <span className="material-icons">timeline</span>
                </button>
                {/* 主轴颜色 */}
                <label className="timeline-toolbar__color" title={t("主轴颜色")}>
                    <input type="color" value={layout.axis_color}
                           onChange={(e) => set_layout({axis_color: e.target.value})}/>
                </label>
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
                        onClick={() => set_zoom((z) => clamp_num(z - 0.1, MIN_ZOOM, MAX_ZOOM, 1))}>
                    <span className="material-icons">remove</span>
                </button>
                <button type="button" className="timeline-btn" title={t("放大")}
                        onClick={() => set_zoom((z) => clamp_num(z + 0.1, MIN_ZOOM, MAX_ZOOM, 1))}>
                    <span className="material-icons">add</span>
                </button>
                <button type="button" className="timeline-btn" title={t("重置缩放")}
                        onClick={() => set_zoom(1)}>
                    <span className="material-icons">restart_alt</span>
                </button>
            </div>
            {/* 主体：画布 + 属性面板 */}
            <div className="timeline-body">
                <div className={`timeline-canvas timeline-canvas--${layout.direction}`} ref={scrollRef}>
                    {/* 起始端把手：拖动可无限延长 */}
                    <div className="timeline-pad timeline-pad--start"
                         style={pad_style(doc.pad.start * zoom, vertical)}>
                        <div className="timeline-pad__handle" data-pad="start">
                            <span className="material-icons">{vertical ? "keyboard_arrow_up" : "keyboard_arrow_left"}</span>
                            <span className="timeline-pad__hint">{t("拖动延长")}</span>
                        </div>
                    </div>
                    <div className="timeline-inner" ref={innerRef}>
                        {/* 主轴：实线用背景填充，虚线/点线用边框绘制，三种线型占位宽度一致 */}
                        <div className="timeline-axis"
                             style={{
                                 background: layout.line_style === "solid" ? layout.axis_color : "transparent",
                                 borderColor:
                                     layout.line_style === "solid" ? "transparent" : layout.axis_color,
                                 borderStyle: axis_border,
                             }}/>
                        {/* 拖拽时的对齐辅助线 */}
                        {guide !== null && (
                            <div className="timeline-guide" style={guide_style(guide, vertical, layout.axis_color)}/>
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
                                t={t}
                            />
                        ))}
                    </div>
                    {/* 结束端把手 */}
                    <div className="timeline-pad timeline-pad--end"
                         style={pad_style(doc.pad.end * zoom, vertical)}>
                        <div className="timeline-pad__handle" data-pad="end">
                            <span className="material-icons">{vertical ? "keyboard_arrow_down" : "keyboard_arrow_right"}</span>
                            <span className="timeline-pad__hint">{t("拖动延长")}</span>
                        </div>
                    </div>
                </div>
                {/* 属性面板 */}
                {selected && (
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
                        <textarea className="timeline-panel__textarea" value={selected.event.desc ?? ""}
                                  onChange={(e) => update_event(selected.event.id, {desc: e.target.value})}/>
                        <label className="timeline-panel__label">{t("日期")}</label>
                        <input className="timeline-panel__input" value={selected.event.date ?? ""}
                               placeholder="YYYY-MM-DD"
                               onChange={(e) => update_event(selected.event.id, {date: e.target.value})}/>
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
                        </div>
                        <div className="timeline-panel__hint">{t("拖动事件卡片可改变位置与所属阶段")}</div>
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
    /** i18next 的 t 函数（类型较复杂，这里只需可调用） */
    t: any;
    /** 列表渲染时传入的 React key（同文件内定义的组件需显式声明） */
    key?: React.Key;
};

function PhaseBlock(props: PhaseBlockProps) {
    const {phase, layout, zoom, vertical, selected_id, t} = props;
    const color = phase.color || layout.axis_color;
    const collapsed = !!phase.collapsed;
    const span = (collapsed ? PHASE_HEAD_SIZE : phase_size(phase)) * zoom;

    return (
        <div className={`timeline-phase${collapsed ? " timeline-phase--collapsed" : ""}`}
             style={vertical ? {height: `${span}px`} : {width: `${span}px`}}>
            {/* 阶段头：可通过属性面板隐藏，隐藏后只剩轴上的色带 */}
            {phase.head_visible !== false && (
            <div className="timeline-phase__head" style={{borderColor: color}}>
                <span className="material-icons timeline-phase__toggle"
                      title={collapsed ? t("展开") : t("折叠")}
                      onClick={() => props.on_update_phase(phase.id, {collapsed: !collapsed})}>
                    {collapsed ? "expand_more" : "expand_less"}
                </span>
                <input className="timeline-phase__name" value={phase.name}
                       style={{color}}
                       onChange={(e) => props.on_update_phase(phase.id, {name: e.target.value})}/>
                <span className="material-icons timeline-phase__op" title={t("添加事件")}
                      onClick={() => props.on_add_event(phase.id)}>add_circle</span>
                <span className="material-icons timeline-phase__op" title={t("隐藏阶段头")}
                      onClick={() => props.on_update_phase(phase.id, {head_visible: false})}>visibility_off</span>
                <span className="material-icons timeline-phase__op timeline-phase__del" title={t("删除阶段")}
                      onClick={() => props.on_delete_phase(phase.id)}>delete</span>
            </div>
            )}
            {!collapsed && (
                <>
                    {/* 阶段轴带：贴合主轴，标识区段颜色 */}
                    <div className="timeline-phase__band" style={{background: color}}/>
                    {/* 阶段头被隐藏时，在轴上提供一个恢复入口 */}
                    {phase.head_visible === false && (
                        <span className="material-icons timeline-phase__show-head"
                              title={t("显示阶段头")}
                              onClick={() => props.on_update_phase(phase.id, {head_visible: true})}>visibility</span>
                    )}
                    {/* 事件卡片：沿轴按 offset 定位，按 side 决定挂哪一侧。
                        开启「两侧交替」时忽略各自的 side，按顺序左右/上下轮流分布。 */}
                    {phase.events.map((e, ei) => {
                        const side: TimelineSide = layout.alternate
                            ? ei % 2 === 0
                                ? "left"
                                : "right"
                            : e.side;
                        return (
                            <EventBubble
                                key={e.id}
                                event={e}
                                phase={phase}
                                layout={layout}
                                vertical={vertical}
                                zoom={zoom}
                                side={side}
                                event_index={ei}
                                phase_index={props.phase_index}
                                selected={selected_id === e.id}
                                on_down={props.on_event_down}
                                on_width_down={props.on_width_down}
                                on_link_down={props.on_link_down}
                                on_delete={props.on_delete_event}
                                t={t}
                            />
                        );
                    })}
                    {/* 阶段沿轴拉伸把手 */}
                    <div className="timeline-phase__resize" data-phase-resize={phase.id}
                         title={t("拖动调整阶段尺寸")}/>
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
    /**
     * 沿轴位置 = 阶段头厚度 + offset × 可用区域。
     * 纵向时映射到 top，横向时映射到 left。
     */
    const pos = `calc(${PHASE_HEAD_SIZE}px + ${event.offset} * (100% - ${PHASE_HEAD_SIZE}px))`;
    /**
     * 样式变量：
     *  --side-gap    卡片到主轴的距离（连线长度），未设置时用 CSS 默认值
     *  --ev-color    当前事件的主题色
     * 沿轴位置由内联样式给出（纵向映射到 top，横向映射到 left）；
     * 侧向位置完全交给 CSS 类（--side-left / --side-right）处理，避免互相覆盖。
     */
    const vars: React.CSSProperties = {["--ev-color" as any]: color};
    if (event.link_length != null) {
        (vars as any)["--side-gap"] = `${event.link_length * zoom}px`;
    }
    const style: React.CSSProperties = vertical ? {top: pos} : {left: pos};
    if (event.width) {
        style.width = `${event.width * zoom}px`;
    }

    return (
        <div className={`timeline-event timeline-event--${layout.card_style} timeline-event--side-${side}`
            + (selected ? " timeline-event--on" : "")
            + (layout.show_connector ? " timeline-event--linked" : "")}
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
                {event.date && <div className="timeline-event__date">{event.date}</div>}
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
