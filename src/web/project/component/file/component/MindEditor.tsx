import React, {useEffect, useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {fileHttp} from "../../../util/config";
import {NotySuccess} from "../../../util/noty";
import {RCode} from "../../../../../common/Result.pojo";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {useTranslation} from "react-i18next";
import MindMapEditor, {MindHandle} from "./MindMapInline";
import {use_editor_auto_save} from "../../../util/editor_auto_save";
import {EditorAutoSaveEnum} from "../../../../../common/req/user.req";
import {using_confirm} from "../../prompts/prompt.util";

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
    const confirm = using_confirm();
    // 用 ref 承接最新的 save，供 keydown 稳定调用
    const apiRef = useRef<MindHandle | null>(null);

    // 代码块来源：数据直接来自 md 的 ```smm-mind，不落文件
    const is_code_source = mind_editor.code_source !== undefined;

    /** 真正执行关闭 */
    const do_close = () => {
        set_mind_editor({});
        // 用 FileList 传进来的 close（即 file_open(null)）清掉 url 上的
        // preview_file_name / preview_mode 参数。不能自己 navigate(getRouterPath())：
        // 那只清 path，query 还在，刷新页面会再次自动打开这个文件。
        mind_editor?.close?.();
    };

    const close = () => {
        if (dirty) {
            confirm({
                sub_title: t("有未保存的修改，确定要关闭吗？"),
                confirm_fun: do_close,
            });
            return;
        }
        do_close();
    };

    const save = async (silent = false) => {
        await apiRef.current?.save(silent);
    };
    // 自动保存读最新 dirty 状态用的 ref
    const dirty_ref = useRef(dirty);
    dirty_ref.current = dirty;
    // 编辑器自动保存（个人设置里可配置）；代码块来源（md 内嵌）不落文件，不自动保存
    use_editor_auto_save(EditorAutoSaveEnum.mind, () => !is_code_source && dirty_ref.current, (silent) => save(silent), is_code_source);

    // Esc 关闭：与项目其它全屏浮层（md 编辑器等）保持一致
    useEffect(() => {
        if (mind_editor.url === undefined && mind_editor.code_source === undefined) {
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
    }, [mind_editor.url, mind_editor.code_source, dirty]);

    // 页面卸载时若有未保存内容，提示用户（与 md 编辑器保持一致的行为，不加额外提示）


    if (mind_editor.url === undefined && !is_code_source) {
        return null;
    }

    return (
        // 代码块来源时（从 md 编辑器里打开）抬高一层：
        // md 编辑器自身是 z-index:1000 的全屏浮层，两者同层时后者会盖住前者。
        <div id={"mind-container"} className={is_code_source ? "mind-container--over" : undefined}>
            <div className={"mind-context"}>
                <MindMapEditor
                    fullscreen
                    reset_key={mind_editor.url ?? mind_editor.name}
                    // 代码块来源直接把内容当数据（不请求文件）
                    url={is_code_source ? undefined : mind_editor.url}
                    data={is_code_source ? mind_editor.code_source : undefined}
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
                    on_save={async (context: string, silent?: boolean) => {
                        // 代码块来源：写回 md 的 ```smm-mind，不落文件
                        if (is_code_source) {
                            mind_editor.on_save_code?.(context);
                            if (!silent) NotySuccess(t("保存成功"));
                            // 写回代码块后关闭全屏编辑器
                            set_mind_editor({});
                            return true;
                        }
                        const rsq = await fileHttp.post(
                            `save/${encodeURIComponent(getRouterAfter("file", getRouterPath()))}${mind_editor.name}`,
                            {context},
                        );
                        if (rsq.code === RCode.Success) {
                            // 自动保存不弹成功提示
                            if (!silent) NotySuccess(t("保存成功"));
                            return true;
                        }
                        return false;
                    }}
                />
            </div>
        </div>
    );
}
