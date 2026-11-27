import React, {useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import OfficeEditorShell from "./OfficeEditorShell";
import DocxPane from "./DocxPane";
import {get_save_path} from "./office_util";
import {use_editor_auto_save} from "../../../../util/editor_auto_save";
import {EditorAutoSaveEnum} from "../../../../../../common/req/user.req";
import {useTranslation} from "react-i18next";

/** docx 编辑器：占满全屏，读取字节后交给文档模型，保存时写回 */
export default function DocxEditor() {
    const {t} = useTranslation();
    const [editor, set_editor] = useAtom($stroe.docx_editor);
    const [dirty, set_dirty] = useState(false);
    const [saving, set_saving] = useState(false);
    const save_ref = useRef<(ok_text: string) => Promise<boolean>>();

    const close = () => {
        const fn = editor.close;
        set_editor({});
        fn?.();
    };

    const on_save = async (silent = false) => {
        if (!save_ref.current) {
            return false;
        }
        set_saving(true);
        try {
            // 自动保存时不弹成功提示
            return await save_ref.current(silent ? "" : t("保存成功"));
        } finally {
            set_saving(false);
        }
    };
    // 自动保存读最新 dirty 状态用的 ref
    const dirty_ref = useRef(dirty);
    dirty_ref.current = dirty;
    // 编辑器自动保存（个人设置里可配置开关/间隔/编辑器范围）
    use_editor_auto_save(EditorAutoSaveEnum.docx, () => dirty_ref.current, () => on_save(true));

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
                <DocxPane
                    url={editor.url}
                    save_path={get_save_path(editor.name ?? "")}
                    on_dirty={set_dirty}
                    bind_save={(fn) => (save_ref.current = fn)}
                />
            )}
        </OfficeEditorShell>
    );
}
