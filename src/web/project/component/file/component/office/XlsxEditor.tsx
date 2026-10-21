import React, {useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import OfficeEditorShell from "./OfficeEditorShell";
import XlsxPane from "./XlsxPane";
import {get_save_path} from "./office_util";
import {use_editor_auto_save} from "../../../../util/editor_auto_save";
import {EditorAutoSaveEnum} from "../../../../../../common/req/user.req";

/** xlsx 编辑器：占满全屏，读取字节后交给网格，保存时写回 */
export default function XlsxEditor() {
    const [editor, set_editor] = useAtom($stroe.excel_editor);
    const [dirty, set_dirty] = useState(false);
    const [saving, set_saving] = useState(false);
    const save_ref = useRef<() => Promise<boolean>>();

    const close = () => {
        const fn = editor.close;
        set_editor({});
        fn?.();
    };

    const on_save = async () => {
        if (!save_ref.current) {
            return false;
        }
        set_saving(true);
        try {
            return await save_ref.current();
        } finally {
            set_saving(false);
        }
    };
    // 自动保存读最新 dirty 状态用的 ref
    const dirty_ref = useRef(dirty);
    dirty_ref.current = dirty;
    // 编辑器自动保存（个人设置里可配置开关/间隔/编辑器范围）
    use_editor_auto_save(EditorAutoSaveEnum.excel, () => dirty_ref.current, () => on_save());

    return (
        <OfficeEditorShell
            name={editor.name}
            dirty={dirty}
            loading={false}
            error={""}
            saving={saving}
            on_save={on_save}
            on_close={close}
        >
            {editor.url && (
                <XlsxPane
                    url={editor.url}
                    save_path={get_save_path(editor.name ?? "")}
                    on_dirty={set_dirty}
                    bind_save={(fn) => (save_ref.current = fn)}
                />
            )}
        </OfficeEditorShell>
    );
}
