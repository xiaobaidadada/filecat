import React, {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {useNavigate, useSearchParams} from "react-router-dom";
import {useAtom} from "jotai";
import markdownit from "markdown-it";
import {ActionButton} from "../../../meta/component/Button";
import {HeaderPortal} from "../../../meta/component/HeaderPortal";
import {Card} from "../../../meta/component/Card";
import {FullScreenContext, FullScreenDiv} from "../../../meta/component/Dashboard";
import {InputRow, InputText} from "../../../meta/component/Input";
import {ButtonText} from "../../../meta/component/Button";
import {NotyFail, NotySuccess} from "../../util/noty";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {$stroe} from "../../util/store";
import {editor_data} from "../../util/store.util";
import Ace from "../file/component/Ace";
import {
    apply_theme_css,
    load_md_theme_css,
    load_md_theme_list,
    save_md_theme,
} from "../file/component/md_editor/md_theme";
import {MD_THEME_TEMPLATE, MD_THEME_PREVIEW_DEFAULT} from "../file/component/md_editor/md_theme_template";

/**
 * md 主题编辑页（独立路由 /md_theme_editor_page）。
 *
 * 左侧 Ace 编辑 css，右侧用当前 md 内容实时预览效果。
 * 主题按 Typora 约定书写（正文容器是 #write），由 apply_theme_css 改写到预览容器上，
 * 与实际编辑器用的是同一套改写逻辑，所见即所得。
 *
 * URL 参数：
 *   id 为空   => 新建主题
 *   id 有值   => 编辑该主题
 */

// 预览容器与实际编辑器共用同一套容器类名，保证主题在里面表现一致
const PREVIEW_SCOPE = ".md-theme-preview .md-editor-sheet";

const md = markdownit({html: true, linkify: true, breaks: false});

export default function MdThemeEditorPage() {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const {check_user_auth} = use_auth_check();
    const can_edit = check_user_auth(UserAuth.md_theme);

    const edit_id = params.get("id") ?? "";
    const is_new = !edit_id;

    const [name, set_name] = useState("");
    const [css, set_css] = useState(MD_THEME_TEMPLATE);
    const [loading, set_loading] = useState(true);
    const [saving, set_saving] = useState(false);
    // 编辑器实例 id：Ace 是命令式组件，用 editor_data 取/设内容
    const editor_id = 88;

    // 预览内容：优先用最近打开的 md 编辑器正文，没有则用内置示例文档
    const [last_context] = useAtom($stroe.md_editor_last_context);
    const preview_md = last_context?.trim() ? last_context : MD_THEME_PREVIEW_DEFAULT;
    const preview_html = useMemo(() => md.render(preview_md), [preview_md]);

    // 载入：新建用模板 + 空名字；编辑则拉取原主题
    useEffect(() => {
        if (!edit_id) {
            const tpl = MD_THEME_TEMPLATE;
            // 先写进 editor_data，Ace 挂载时会读它作为初始值（Ace 挂载早于下面的 setValue effect）
            editor_data.set_value_temp(tpl, editor_id);
            set_name("");
            set_css(tpl);
            set_loading(false);
            return;
        }
        Promise.all([load_md_theme_list(), load_md_theme_css(edit_id)]).then(([list, content]) => {
            const item = list.find(i => i.id === edit_id);
            const css_content = content || MD_THEME_TEMPLATE;
            editor_data.set_value_temp(css_content, editor_id);
            set_name(item?.id ?? "");
            set_css(css_content);
        }).finally(() => set_loading(false));
    }, [edit_id]);

    // Ace 挂载完成后把内容写进去。
    // 依赖里不能有 css：打字 -> set_css -> 回写 setValue -> 光标归零，输入会变成倒序。
    useEffect(() => {
        if (loading) {
            return;
        }
        const editor = editor_data.get_editor(editor_id);
        if (editor) {
            editor.setValue(editor_data.get_value_temp(editor_id) ?? "", -1);
            editor.clearSelection();
        }
    }, [loading]);

    // 实时预览：css 变化后注入预览容器
    useEffect(() => {
        if (loading) {
            return;
        }
        apply_theme_css("theme_preview", css, PREVIEW_SCOPE);
    }, [css, loading]);

    const save = async () => {
        const n = name.trim();
        if (!n) {
            NotyFail(t("请输入主题名称"));
            return;
        }
        set_saving(true);
        try {
            const saved = await save_md_theme({
                id: is_new ? undefined : edit_id,
                name: n,
                css: editor_data.get_editor_value(editor_id) ?? css,
            });
            if (saved) {
                NotySuccess(t("保存成功"));
                navigate(-1);
            } else {
                NotyFail(t("保存失败"));
            }
        } finally {
            set_saving(false);
        }
    };

    return <div>
        <HeaderPortal position={"right"}>
            <ActionButton icon={"arrow_back"} title={t("上一页")} onClick={() => navigate(-1)}/>
        </HeaderPortal>
        <FullScreenDiv isFull={true} more={true}>
            <FullScreenContext>
                <div className={"md-theme-editor"}>
                    <div className={"md-theme-editor__left"}>
                        <Card title={is_new ? t("新建主题") : t("编辑主题")} titleCom={<>
                            {can_edit &&
                                <ButtonText text={saving ? t("保存中") : t("保存")}
                                            clickFun={() => {
                                                if (!saving) {
                                                    save();
                                                }
                                            }}/>}
                        </>}>
                            <InputRow label={t("主题名称")} label_width={"6rem"}>
                                <InputText value={name} disabled={!can_edit}
                                           placeholder={t("请输入主题名称")}
                                           handleInputChange={(v) => set_name(v)}/>
                            </InputRow>
                            <div className={"md-theme-editor__ace"}>
                                <Ace
                                    name={"theme.css"}
                                    editor_id={editor_id}
                                    model={"ace/mode/css"}
                                    on_change={() => {
                                        const v = editor_data.get_editor_value(editor_id);
                                        if (v !== undefined) {
                                            set_css(v);
                                        }
                                    }}
                                    options={{
                                        showPrintMargin: false,
                                        highlightActiveLine: true,
                                        wrap: true,
                                    }}
                                />
                            </div>
                        </Card>
                    </div>
                    <div className={"md-theme-editor__right"}>
                        <Card title={t("预览")} titleCom={
                            <span className={"md-theme-editor__tip"}>{t("主题实时预览")}</span>
                        }>
                            <div className={"md-theme-preview"}>
                                <div className={"md-editor-sheet"}>
                                    <div className={"md-wysiwyg-content"}
                                         dangerouslySetInnerHTML={{__html: preview_html}}/>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </FullScreenContext>
        </FullScreenDiv>
    </div>;
}
