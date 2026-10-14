import React, {useEffect, useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {fileHttp} from "../../../util/config";
import {NotySuccess} from "../../../util/noty";
import {RCode} from "../../../../../common/Result.pojo";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {useTranslation} from "react-i18next";
import MindMapEditor, {MindHandle} from "./MindMapInline";

/**
 * 思维导图全屏编辑器（.mind）。
 *
 * 结构与 ExcalidrawEditor 完全对称：由 $stroe.mind_editor 驱动，在 Layout 里挂载，
 * 打开后铺满整个窗口；保存和关闭都通过 file_open 传进来的 close 清理路由参数。
 */
export default function MindEditor() {
    const [mind_editor, set_mind_editor] = useAtom($stroe.mind_editor);
    const [dirty, set_dirty] = useState(false);
    const {t} = useTranslation();
    // 用 ref 承接最新的 save，供 keydown 稳定调用
    const apiRef = useRef<MindHandle | null>(null);

    const close = () => {
        if (dirty && !window.confirm(t("有未保存的修改，确定要关闭吗？"))) {
            return;
        }
        set_mind_editor({});
        // 用 FileList 传进来的 close（即 file_open(null)）清掉 url 上的
        // preview_file_name / preview_mode 参数。不能自己 navigate(getRouterPath())：
        // 那只清 path，query 还在，刷新页面会再次自动打开这个文件。
        mind_editor?.close?.();
    };

    const save = async () => {
        await apiRef.current?.save();
    };
    // 页面卸载时若有未保存内容，提示用户（与 md 编辑器保持一致的行为，不加额外提示）


    if (mind_editor.url === undefined) {
        return null;
    }

    return (
        <div id={"mind-container"}>
            <div className={"mind-context"}>
                <MindMapEditor
                    fullscreen
                    reset_key={mind_editor.url}
                    url={mind_editor.url}
                    on_dirty={set_dirty}
                    register={(handle) => {
                        apiRef.current = handle;
                    }}
                    header={
                        <div className="mind-topbar">
                            <span className="material-icons mind-topbar__icon">account_tree</span>
                            <span className="mind-topbar__name">{mind_editor.name}</span>
                            <span style={{flex: 1}}/>
                            <button type="button" className="mind-btn"
                                    title={t("保存") + " (Ctrl+S)"} onClick={save}>
                                <span className="material-icons">save</span>
                            </button>
                            <button type="button" className="mind-btn"
                                    title={t("关闭")} onClick={close}>
                                <span className="material-icons">close</span>
                            </button>
                        </div>
                    }
                    on_save={async (context: string) => {
                        const rsq = await fileHttp.post(
                            `save/${encodeURIComponent(getRouterAfter("file", getRouterPath()))}${mind_editor.name}`,
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
