import React, {useCallback, useEffect, useRef, useState} from "react";
import * as lodash from "lodash";

// 尺寸限制：可以是固定数值，也可以是动态函数（拖动时实时计算）
export type DragLimit = number | (() => number);

export interface UseDragResizeOptions {
    // 拖拽方向：vertical=上下拖动改高度（clientY），horizontal=左右拖动改宽度（clientX）
    direction?: "vertical" | "horizontal";
    // 事件绑定目标：pointermove/pointerup 绑定在该容器上（保持各组件原有行为）；不传则绑 window
    target_ref?: React.RefObject<HTMLElement>;
    // 按下时读取当前尺寸（单位由调用方决定，em / px 均可）
    get_start_size: () => number;
    // 把鼠标位移（像素）换算成调用方的尺寸单位（可为正负）
    px_to_unit: (delta_px: number) => number;
    // 最小尺寸，可传函数做动态边界（每次拖动实时计算）
    min?: DragLimit;
    // 最大尺寸，不传表示不限制，也可传函数做动态边界
    max?: DragLimit;
    // pointermove 节流毫秒，不传则不节流
    throttle?: number;
    // 尺寸变化回调（做持久化 / 副作用，如 fitAddon.fit()）
    on_change: (size: number) => void;
    // 拖拽结束回调（可选）
    on_drag_end?: () => void;
}

export interface UseDragResizeResult {
    // 是否正在拖拽（供调用方控制 overlay 等 UI）
    dragging: boolean;
    // 绑定到拖拽把手元素的 pointerdown 处理
    on_pointer_down: (event: React.PointerEvent) => void;
    // 结束拖拽（供 overlay 兜底绑定 pointerup）
    on_pointer_up: () => void;
}

// 读取限制值（支持数字或动态函数）
function resolve_limit(limit: DragLimit | undefined): number | undefined {
    if (limit === undefined) return undefined;
    return typeof limit === "function" ? limit() : limit;
}

/**
 * 通用拖拽调尺寸：统一处理 pointerdown/move/up、起始坐标与尺寸快照、位移换算、
 * 上下限钳制、拖拽状态与事件清理。各组件的单位换算、持久化、布局副作用由回调自行处理。
 */
export function use_drag_resize(options: UseDragResizeOptions): UseDragResizeResult {
    const {
        direction = "vertical",
        target_ref,
        get_start_size,
        px_to_unit,
        min,
        max,
        throttle,
        on_change,
        on_drag_end,
    } = options;

    const [dragging, set_dragging] = useState(false);
    // 拖动起始快照：鼠标坐标 + 该方向上的起始尺寸
    const start_ref = useRef<{ pos: number; size: number } | null>(null);
    // 用 ref 持有最新回调，避免把它们放进事件监听的依赖里导致频繁重绑
    const on_change_ref = useRef(on_change);
    on_change_ref.current = on_change;

    // 取鼠标在该方向上的坐标（vertical 用 clientY，horizontal 用 clientX）
    const get_pos = (event: PointerEvent | React.PointerEvent) =>
        direction === "vertical" ? event.clientY : event.clientX;

    // 用 ref 持有最新参数，保证下面的事件处理函数始终稳定（不随 render 重建）
    const latest_ref = useRef({direction, get_start_size, px_to_unit, min, max, get_pos});
    latest_ref.current = {direction, get_start_size, px_to_unit, min, max, get_pos};

    // 计算并应用新尺寸（稳定引用）
    const handle_move = useCallback((event: PointerEvent) => {
        const start = start_ref.current;
        if (!start) return;
        const {px_to_unit, min, max, get_pos} = latest_ref.current;
        // 向上/向左拖动为增大：起始坐标 - 当前坐标
        const delta_px = start.pos - get_pos(event);
        let next = start.size + px_to_unit(delta_px);
        // 动态读取上下限，保证拖动过程中重新计算（不能只在初始化时读一次）
        const min_val = resolve_limit(min);
        const max_val = resolve_limit(max);
        if (min_val !== undefined) next = Math.max(min_val, next);
        if (max_val !== undefined) next = Math.min(max_val, next);
        on_change_ref.current(next);
    }, []);

    // 节流版本（随 throttle 变化重建）
    const move_handler = React.useMemo(() => {
        if (throttle === undefined) return handle_move;
        return lodash.throttle((event: PointerEvent) => handle_move(event), throttle);
    }, [throttle, handle_move]);

    // 拖拽结束：清理状态与事件，并取消节流中待执行的任务
    const handle_up = useCallback(() => {
        start_ref.current = null;
        set_dragging(false);
        const throttled = move_handler as unknown as { cancel?: () => void };
        if (typeof throttled.cancel === "function") throttled.cancel();
        on_drag_end?.();
    }, [move_handler, on_drag_end]);

    // 按下：记录起始坐标与尺寸，进入拖拽状态
    const on_pointer_down = useCallback((event: React.PointerEvent) => {
        const {get_start_size, get_pos} = latest_ref.current;
        start_ref.current = { pos: get_pos(event), size: get_start_size() };
        set_dragging(true);
    }, []);

    // 拖拽期间在目标容器上监听 move / up，并在卸载或结束时清理
    useEffect(() => {
        if (!dragging) return;
        const el = target_ref?.current ?? window;
        el.addEventListener("pointermove", move_handler as EventListener);
        el.addEventListener("pointerup", handle_up);
        return () => {
            el.removeEventListener("pointermove", move_handler as EventListener);
            el.removeEventListener("pointerup", handle_up);
        };
    }, [dragging, move_handler, handle_up, target_ref]);

    // 组件卸载时取消节流中待执行的任务，避免卸载后触发回调
    useEffect(() => {
        const throttled = move_handler as unknown as { cancel?: () => void };
        return () => {
            if (typeof throttled.cancel === "function") throttled.cancel();
        };
    }, [move_handler]);

    return {dragging, on_pointer_down, on_pointer_up: handle_up};
}
