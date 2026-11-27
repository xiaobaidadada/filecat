import React, {useEffect, useRef, useState} from "react";
import {EditorModel} from "@office-kit/docx-editor";
import DocxBody from "./DocxBody";
import {fetch_bytes, write_back} from "./office_util";
import {model_to_bytes, open_docx_editor} from "./docx_util";

interface Props {
    /** 源文件下载地址 */
    url: string;
    /** 文件路径（保存用） */
    save_path: string;
    /** 脏标记变化（用于外部决定是否显示保存按钮） */
    on_dirty?: (dirty: boolean) => void;
    /** 把保存方法交给外部（Studio 的 Header 保存按钮调用） */
    bind_save?: (fn: () => Promise<boolean>) => void;
}

/**
 * docx 文档内容：读取字节 → 编辑模型；保存时写回。
 * 只负责内容，外壳由调用方提供（全屏编辑器 / Studio 内嵌各用各的）。
 */
export default function DocxPane(props: Props) {
    const {url, save_path, on_dirty, bind_save} = props;
    const [model, set_model] = useState<EditorModel>();
    const [error, set_error] = useState("");
    const [loading, set_loading] = useState(true);
    const [dirty, set_dirty] = useState(false);
    // DocxBody 交出来的「导出字节」函数
    const export_ref = useRef<() => Uint8Array>();

    useEffect(() => {
        if (!url) {
            return;
        }
        let alive = true;
        set_loading(true);
        set_error("");
        set_dirty(false);
        set_model(undefined);
        fetch_bytes(url)
            .then((bytes) => {
                if (alive) {
                    set_model(open_docx_editor(bytes));
                }
            })
            .catch((e) => alive && set_error(String(e?.message ?? e)))
            .finally(() => alive && set_loading(false));
        return () => {
            alive = false;
        };
    }, [url]);

    // 脏标记对外同步
    useEffect(() => {
        on_dirty?.(dirty);
    }, [dirty, on_dirty]);

    // 保存：把模型导出成字节，再上传
    useEffect(() => {
        bind_save?.(async () => {
            if (!export_ref.current) {
                return false;
            }
            const ok = await write_back(save_path, export_ref.current());
            if (ok) {
                set_dirty(false);
            }
            return ok;
        });
    }, [save_path, bind_save]);

    if (error) {
        return <div className="office-editor__tip office-editor__tip--error">{error}</div>;
    }
    if (loading || !model) {
        return <div className="office-editor__tip">读取中…</div>;
    }
    return (
        <DocxBody
            model={model}
            on_change={set_dirty}
            bind_save={(fn) => (export_ref.current = fn)}
        />
    );
}
