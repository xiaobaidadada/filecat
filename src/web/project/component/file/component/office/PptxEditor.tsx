import React, {useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import OfficeEditorShell from "./OfficeEditorShell";
import PptxPane from "./PptxPane";
import {get_save_path} from "./office_util";
import {use_editor_auto_save} from "../../../../util/editor_auto_save";
import {EditorAutoSaveEnum} from "../../../../../../common/req/user.req";

/**
 * pptx 编辑器：占满全屏。
 *
 * 保存由编辑器内部接管（点它标题栏的保存 / Ctrl+S 都会走 PptxPane 的 onSave），
 * 外层 Header 的保存按钮只是转调 EditorHandle.save()。
 */
export default function PptxEditor() {
    const [editor, set_editor] = useAtom($stroe.pptx_editor);
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
    // 自动保存读最新 dirty 状态
    const dirty_ref = useRef(dirty);
    dirty_ref.current = dirty;
    use_editor_auto_save(EditorAutoSaveEnum.pptx, () => dirty_ref.current, () => on_save());

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
                <PptxPane
                    url={editor.url}
                    file_name={editor.name ?? ""}
                    save_path={get_save_path(editor.name ?? "")}
                    on_dirty={set_dirty}
                    bind_save={(fn) => (save_ref.current = fn)}
                />
            )}
        </OfficeEditorShell>
    );
}
