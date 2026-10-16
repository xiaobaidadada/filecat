import React, {useEffect, useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {fileHttp} from "../../../util/config";
import {NotySuccess} from "../../../util/noty";
import {RCode} from "../../../../../common/Result.pojo";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {useTranslation} from "react-i18next";
import TimelineEditorBody, {TimelineHandle} from "./timeline/TimelineInline";

/**
 * 时间轴全屏编辑器（.timeline）。
 *
 * 结构与 MindEditor / ExcalidrawEditor 完全对称：由 $stroe.timeline_editor 驱动，
 * 在 Layout 里挂载，打开后铺满整个窗口；保存与关闭都通过 file_open 传进来的 close 清理路由参数。
 */
export default function TimelineEditor() {
    const [timeline_editor, set_timeline_editor] = useAtom($stroe.timeline_editor);
    const [dirty, set_dirty] = useState(false);
    const {t} = useTranslation();
    /** 编辑器暴露的句柄，供保存按钮与快捷键使用 */
    const apiRef = useRef<TimelineHandle | null>(null);

    const close = () => {
        // 有未保存改动时二次确认，避免误关丢失
        if (dirty && !window.confirm(t("有未保存的修改，确定要关闭吗？"))) {
            return;
        }
        set_timeline_editor({});
        // 用 FileList 传进来的 close（即 file_open(null)）清掉 url 上的
        // preview_file_name / preview_mode 参数，否则刷新页面会再次自动打开这个文件。
        timeline_editor?.close?.();
    };

    const save = async () => {
        await apiRef.current?.save();
    };

    // Esc 关闭：与项目其它全屏浮层（md / mind 编辑器等）保持一致
    useEffect(() => {
        if (timeline_editor.url === undefined) {
            return;
        }
        const on_key = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                close();
            }
        };
        document.addEventListener("keydown", on_key);
        return () => document.removeEventListener("keydown", on_key);
    }, [timeline_editor.url, dirty]);

    if (timeline_editor.url === undefined) {
        return null;
    }

    return (
        <div id={"timeline-container"}>
            <div className={"timeline-context"}>
                <TimelineEditorBody
                    fullscreen
                    reset_key={timeline_editor.url ?? timeline_editor.name}
                    url={timeline_editor.url}
                    on_dirty={set_dirty}
                    register={(handle) => {
                        apiRef.current = handle;
                    }}
                    header={
                        <div className="timeline-topbar">
                            <span className="material-icons timeline-topbar__icon">timeline</span>
                            <span className="timeline-topbar__name">{timeline_editor.name}</span>
                            {dirty && <span className="timeline-topbar__dirty">*</span>}
                            <span className="timeline-topbar__gap"/>
                            <button type="button" className="timeline-btn"
                                    title={t("保存") + " (Ctrl+S)"} onClick={save}>
                                <span className="material-icons">save</span>
                            </button>
                            <button type="button" className="timeline-btn"
                                    title={t("关闭")} onClick={close}>
                                <span className="material-icons">close</span>
                            </button>
                        </div>
                    }
                    on_save={async (context: string) => {
                        const rsq = await fileHttp.post(
                            `save/${encodeURIComponent(getRouterAfter("file", getRouterPath()))}${timeline_editor.name}`,
                            {context},
                        );
                        if (rsq.code === RCode.Success) {
                            NotySuccess(t("保存成功"));
                            return true;
                        }
                        return false;
                    }}
                />
            </div>
        </div>
    );
}
