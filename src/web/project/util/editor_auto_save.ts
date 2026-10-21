import {useEffect, useRef} from "react";
import {useAtom} from "jotai";
import {$stroe} from "./store";
import {EditorAutoSaveEnum, UserData} from "../../../common/req/user.req";

/** 自动保存配置里的编辑器 id（全局统一，各编辑器和设置页共用一份） */
export const AUTO_SAVE_EDITORS: { id: EditorAutoSaveEnum, label: string }[] = [
    {id: EditorAutoSaveEnum.ace, label: "文本编辑器(ace)"},
    {id: EditorAutoSaveEnum.md, label: "md编辑器"},
    {id: EditorAutoSaveEnum.mind, label: "思维导图编辑器"},
    {id: EditorAutoSaveEnum.draw, label: "draw编辑器"},
    {id: EditorAutoSaveEnum.timeline, label: "时间线编辑器"},
    {id: EditorAutoSaveEnum.image, label: "图片编辑器"},
    {id: EditorAutoSaveEnum.excel, label: "excel编辑器"},
];

export type EditorAutoSaveConfig = NonNullable<UserData["editor_auto_save"]>;

/**
 * 编辑器自动保存 hook：读取个人设置里的配置，启用且勾选了 editor_id 时，
 * 每 interval 秒检查 dirty，有未保存改动就调 save。
 * dirty 用 getter 每次读取最新值，避免把状态放进依赖导致定时器反复重建。
 */
export function use_editor_auto_save(editor_id: EditorAutoSaveEnum, is_dirty: () => boolean, save: (silent?: boolean) => any, readonly = false) {
    const [user_info] = useAtom($stroe.user_base_info);
    const cfg: EditorAutoSaveConfig | undefined = user_info?.user_data?.editor_auto_save;
    const cfg_ref = useRef(cfg);
    cfg_ref.current = cfg;
    const dirty_ref = useRef(is_dirty);
    dirty_ref.current = is_dirty;
    const save_ref = useRef(save);
    save_ref.current = save;

    useEffect(() => {
        if (readonly) {
            return;
        }
        const c = cfg_ref.current;
        if (!c?.enable || c.interval <= 0 || !c.editors?.includes(editor_id)) {
            return;
        }
        const timer = setInterval(() => {
            if (dirty_ref.current()) {
                save_ref.current(true);
            }
        }, c.interval * 1000);
        return () => clearInterval(timer);
    }, [cfg, editor_id, readonly]);
}
