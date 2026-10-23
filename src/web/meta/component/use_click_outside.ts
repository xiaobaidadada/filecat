import {RefObject, useEffect} from "react";

/**
 * 「浮层外点击关闭」通用逻辑。
 *
 * 项目里的浮层（Select 下拉、cron 编辑面板等）普遍用 createPortal 把内容挂到
 * document.body 上。这类浮层的 DOM 不在触发器的祖先链里，所以判断"是否点在外部"
 * 时，除了触发器自身，还要排除所有 portal 出来的浮层，否则点浮层内部
 * 会被误判成点击外部而关闭。
 *
 * 约定：portal 出来的浮层根节点加上 `data-layer="popup"` 标记，
 * 这里统一识别，调用方无需关心浮层用了什么 class 或挂在哪里。
 *
 * @param active    浮层是否处于打开状态，为 false 时不注册监听
 * @param refs      额外的"内部区域" ref（如触发器），命中任意一个都视为内部点击
 * @param onOutside 判定为外部点击时的回调
 */
export function use_click_outside(
    active: boolean,
    refs: RefObject<HTMLElement | null>[],
    onOutside: () => void,
) {
    useEffect(() => {
        if (!active) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // 命中调用方指定的区域（如触发器）算内部
            for (const ref of refs) {
                if (ref.current?.contains(target)) return;
            }
            // 点在任意 portal 浮层内也算内部，避免误关
            if (target.closest?.("[data-layer]")) return;
            onOutside();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
        // refs 是稳定的 ref 对象数组，依赖只关心 active 与回调
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);
}
