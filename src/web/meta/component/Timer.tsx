import React, {useCallback, useEffect, useRef, useState} from "react";

export type TimerFormat = "ms" | "s" | "auto";

/** 格式化耗时时长 */
export function formatElapsed(ms: number, format: TimerFormat = "auto"): string {
    if (format === "s") {
        return `${(ms / 1000).toFixed(2)} s`;
    }
    if (format === "auto" && ms >= 1000) {
        return `${(ms / 1000).toFixed(2)} s`;
    }
    return `${Math.round(ms)} ms`;
}

interface TimerProps {
    /** true 时开始/继续计时，false 停止（保留当前显示值） */
    running?: boolean;
    /** 该值变化时从 0 重新开始一次完整计时 */
    resetKey?: string | number;
    /** 显示格式，默认 auto */
    format?: TimerFormat;
    /** 前缀文本（如"耗时"），可选 */
    prefix?: string;
    /** 每次刷新时回传当前耗时（毫秒） */
    onTick?: (ms: number) => void;
    /** 外层样式类 */
    className?: string;
}

/**
 * 通用实时计时显示组件
 * - 通过 running 控制计时开始/暂停，通过 resetKey 变化触发从 0 重新计时
 * - 计时过程中使用 requestAnimationFrame 高频刷新，实现"不断变化"的效果
 * - 停止计时后保留当前显示值，可作为一次任务的总耗时展示
 */
export default function Timer(props: TimerProps) {
    const {running = false, resetKey = 0, format = "auto", prefix = "", onTick, className} = props;
    // 当前显示耗时（毫秒）
    const [ms, setMs] = useState(0);
    // 本次计时的开始时刻
    const startRef = useRef<number>(0);
    const rafRef = useRef<number | null>(null);
    // 最新的 running，供帧回调读取，避免闭包过期
    const runningRef = useRef(running);
    runningRef.current = running;

    const stopLoop = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    const beginLoop = useCallback(() => {
        stopLoop();
        const tick = () => {
            const now = performance.now() - startRef.current;
            setMs(now);
            onTick?.(now);
            if (runningRef.current) {
                rafRef.current = requestAnimationFrame(tick);
            }
        };
        tick();
    }, [onTick, stopLoop]);

    // resetKey 变化：归零并（若正在计时）立即开启新一轮计时
    useEffect(() => {
        startRef.current = performance.now();
        setMs(0);
        onTick?.(0);
        if (runningRef.current) {
            beginLoop();
        }
    }, [resetKey]);

    // running 变化：开始或停止计时
    useEffect(() => {
        if (running) {
            beginLoop();
        } else {
            stopLoop();
        }
    }, [running, beginLoop, stopLoop]);

    // 卸载时清理帧循环
    useEffect(() => () => stopLoop(), [stopLoop]);

    return (
        <span className={className}>
            {prefix}{formatElapsed(ms, format)}
        </span>
    );
}
