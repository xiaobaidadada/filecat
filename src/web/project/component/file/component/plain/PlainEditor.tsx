import React, {useEffect, useRef, useState} from "react";
import {useAtom} from "jotai";
import {useTranslation} from "react-i18next";
import {$stroe} from "../../../../util/store";
import OfficeEditorShell from "../office/OfficeEditorShell";
import {NotySuccess} from "../../../../util/noty";

/**
 * 简易文本编辑器：直接用浏览器原生 textarea。
 * 存在的意义是移动端——Ace 在手机上的输入法、选中、缩放问题太多，原生 textarea 反而好用。
 */
export default function PlainEditor() {
    const {t} = useTranslation();
    const [plain, setPlain] = useAtom($stroe.plain_editor);
    const [text, set_text] = useState(plain.value ?? "");
    const [saving, set_saving] = useState(false);
    const ref = useRef<HTMLTextAreaElement>(null);

    /** 内容与打开时的原文不一致即视为有改动 */
    const dirty = text !== (plain.value ?? "");

    const close = () => {
        const fn = plain.close;
        setPlain({});
        fn?.();
    };

    const on_save = async (silent = false) => {
        if (!plain.save) {
            return false;
        }
        set_saving(true);
        try {
            await plain.save(text);
            // 保存成功后同步基准值，dirty 自动归零
            setPlain({...plain, value: text});
            if (!silent) {
                NotySuccess(t("保存成功"));
            }
            return true;
        } finally {
            set_saving(false);
        }
    };

    useEffect(() => {
        // 打开时把光标放到开头，避免长文档默认滚到底部
        ref.current?.setSelectionRange(0, 0);
        ref.current?.scrollTo(0, 0);
    }, []);

    return (
        <OfficeEditorShell
            name={plain.fileName}
            dirty={dirty}
            saving={saving}
            on_save={on_save}
            on_close={close}
        >
            <textarea
                ref={ref}
                className="plain-editor__area"
                value={text}
                spellCheck={false}
                autoCapitalize={"off"}
                autoCorrect={"off"}
                onChange={(e) => set_text(e.target.value)}
            />
        </OfficeEditorShell>
    );
}
