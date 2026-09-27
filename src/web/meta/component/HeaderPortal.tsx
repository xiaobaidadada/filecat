import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';

/** 全站唯一 Header 的槽位 id：title 之前的左侧区域（原 left_children 的位置） */
export const PAGE_HEADER_SLOT_LEFT_ID = "page-header-slot-left";
/** 全站唯一 Header 的槽位 id：title 之后的右侧区域（原 children 的位置） */
export const PAGE_HEADER_SLOT_RIGHT_ID = "page-header-slot-right";


export function HeaderPortal(props: React.PropsWithChildren<{ position?: "left" | "right" }>) {
    // 槽位节点需要等 Layout 的 Header 挂载后才存在，用 state 保存以便触发渲染
    const [slot, set_slot] = useState<HTMLElement | null>(null);
    const slot_id = props.position === "right" ? PAGE_HEADER_SLOT_RIGHT_ID : PAGE_HEADER_SLOT_LEFT_ID;

    useEffect(() => {
        set_slot(document.getElementById(slot_id));
    }, [slot_id]);

    // 没找到槽位（例如全屏页 / 分享页没有 Header）时什么都不渲染
    if (!slot) {
        return null;
    }
    return createPortal(props.children, slot);
}
