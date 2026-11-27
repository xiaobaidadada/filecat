import React, {useEffect, useRef, useState} from "react";
import {EditorHandle, mountEditor} from "@office-kit/pptx-editor";
import {fetch_bytes, write_back} from "./office_util";

interface Props {
    /** 源文件下载地址 */
    url: string;
    /** 文件路径（保存用） */
    save_path: string;
    /** 文件名（编辑器标题栏显示） */
    file_name: string;
    /** 脏标记变化 */
    on_dirty?: (dirty: boolean) => void;
    /** 把保存方法交给外部（Header 的保存按钮用） */
    bind_save?: (fn: (ok_text: string) => Promise<boolean>) => void;
}

/**
 * pptx 编辑器。
 *
 * 和 docx/xlsx 不同，@office-kit/pptx-editor 自带完整 UI（标题栏、工具栏、
 * 缩略图、画布），只需要把它挂到一个有高度的 DOM 上，所以这里不做任何渲染，
 * 只负责「读字节 → mountEditor → 保存写回」。
 *
 * 编辑器默认渲染进自己的 shadow root，页面样式和它互不影响，不会污染后台。
 */
export default function PptxPane(props: Props) {
    const {url, save_path, file_name, on_dirty, bind_save} = props;
    const host_ref = useRef<HTMLDivElement>(null);
    const handle_ref = useRef<EditorHandle>();
    // onSave 是 mountEditor 时就注册进去的闭包，读不到后续的 ok_text 参数，
    // 用 ref 中转当前该显示的提示文案
    const save_ok_text_ref = useRef("");
    const [error, set_error] = useState("");
    const [loading, set_loading] = useState(true);

    useEffect(() => {
        if (!url) {
            return;
        }
        const host = host_ref.current;
        if (!host) {
            return;
        }
        let alive = true;
        let handle: EditorHandle | undefined;
        set_loading(true);
        set_error("");

        fetch_bytes(url)
            .then((bytes) => {
                if (!alive) {
                    return;
                }
                handle = mountEditor(host, {
                    source: bytes,
                    fileName: file_name,
                    // 保存走我们的接口：用户点保存或按 Ctrl+S 时，
                    // 编辑器把当前字节交出来，这里直接写回服务器。
                    onSave: async (pptx) => {
                        const ok = await write_back(save_path, pptx, save_ok_text_ref.current);
                        if (ok) {
                            on_dirty?.(false);
                        }
                        return ok;
                    },
                    // 关掉编辑器自带的自动保存：本项目有自己的自动保存开关，
                    // 两套同时生效会让「保存」这个动作变得没有意义
                    autoSave: false,
                    // 外层已经有 Header（文件名 + 保存 + 关闭），
                    // 用 compact 去掉编辑器自带标题栏的产品名，避免两套标题叠着
                    compact: true,
                });
                // 保存句柄要给到外层，否则顶栏保存按钮和 Ctrl+S 都调不到编辑器的 save
                handle_ref.current = handle;
                // 有改动时把 dirty 状态交给外层，顶栏才会出现保存按钮
                handle.on("dirtychange", (e) => {
                    on_dirty?.(e.dirty);
                });
            })
            .catch((e) => {
                if (alive) {
                    set_error(String(e?.message ?? e));
                }
            })
            .finally(() => alive && set_loading(false));

        return () => {
            alive = false;
            // 卸载时销毁编辑器，否则事件监听和 shadow DOM 会一直挂着
            handle?.destroy();
            handle_ref.current = undefined;
        };
    }, [url, file_name, save_path]);

    // 把保存能力交给外层 Header
    useEffect(() => {
        bind_save?.(async (ok_text: string) => {
            const handle = handle_ref.current;
            if (!handle) {
                return false;
            }
            // save() 会走 onSave，成功后 dirty 归位
            save_ok_text_ref.current = ok_text;
            await handle.save();
            save_ok_text_ref.current = "";
            return !handle.dirty;
        });
    }, [bind_save]);

    return (
        <div className="pptx-pane">
            {error && <div className="office-editor__tip office-editor__tip--error">{error}</div>}
            {loading && !error && <div className="office-editor__tip">读取中…</div>}
            <div className="pptx-pane__host" ref={host_ref}/>
        </div>
    );
}
