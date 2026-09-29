import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useNavigate} from "react-router-dom";
import {ActionButton} from "../../../meta/component/Button";
import {HeaderPortal} from "../../../meta/component/HeaderPortal";
import {Column, Dashboard, FullScreenContext, FullScreenDiv, Row} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {InputRow, Select} from "../../../meta/component/Input";
import {Button, ButtonText} from "../../../meta/component/Button";
import {NotyFail, NotySuccess} from "../../util/noty";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {md_editor_setting_pojo, md_theme_item} from "../../../../common/req/common.pojo";
import {routerConfig} from "../../../../common/RouterConfig";
import {
    apply_md_editor_setting,
    load_md_editor_setting,
    MD_EDITOR_SETTING_DEFAULT,
    save_md_editor_setting,
} from "../file/component/md_editor/MdEditorSetting";
import {del_md_theme, load_md_theme_list} from "../file/component/md_editor/md_theme";
import {using_confirm} from "../prompts/prompt.util";

/**
 * md 编辑器全局设置页（独立路由 /md_editor_setting_page）。
 *
 * 这些设置是全局的：所有用户共用一份，保存在服务端，影响所有人的 md 编辑器外观。
 * 每个字段直接输入完整的 CSS 值（如 10px、3rem、80%、1.8），单位自己写，不做单位选择。
 */

// 字段定义：key -> 显示名
const FIELDS: { key: keyof md_editor_setting_pojo, label: string }[] = [
    {key: "content_max_width", label: "正文最大宽度"},
    {key: "content_padding", label: "正文左右边距"},
    {key: "font_size", label: "正文字号"},
    {key: "line_height", label: "行高"},
];

// 合法 CSS 尺寸值：数字 + 可选单位（与后端 is_valid_size 的规则保持一致）
const SIZE_RE = /^\d+(\.\d+)?(px|%|rem|em|vw|vh|ch)?$/;

export default function MdEditorSettingPage() {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const {check_user_auth} = use_auth_check();
    const confirm_dell_all = using_confirm();
    // 无权限时页面降级为只读：能看当前配置，但不能改也不能保存
    const can_edit = check_user_auth(UserAuth.md_editor_setting);

    // 直接存用户输入的原始字符串，提交时再校验
    const [values, set_values] = useState<Record<string, string>>({});
    const [loading, set_loading] = useState(true);
    const [saving, set_saving] = useState(false);
    // 主题列表与当前选中的主题 id（全局设置，所有用户共用）
    const [themes, set_themes] = useState<md_theme_item[]>([]);
    const [theme, set_theme] = useState<string>(MD_EDITOR_SETTING_DEFAULT.theme);

    useEffect(() => {
        Promise.all([load_md_editor_setting(), load_md_theme_list()]).then(([s, list]) => {
            const next: Record<string, string> = {};
            FIELDS.forEach(f => next[f.key] = s[f.key] ?? "");
            set_values(next);
            set_theme(s.theme ?? MD_EDITOR_SETTING_DEFAULT.theme);
            set_themes(list);
        }).finally(() => set_loading(false));
    }, []);

    const save = async () => {
        // 逐项校验格式，非法就提示，不提交
        for (const f of FIELDS) {
            const v = (values[f.key] ?? "").trim();
            if (!SIZE_RE.test(v)) {
                NotyFail(`${t(f.label)}: ${t("请输入合法的 CSS 值，例如 10px、3rem、80%")}`);
                return;
            }
        }
        const body: any = {};
        FIELDS.forEach(f => body[f.key] = values[f.key].trim());
        body.theme = theme;
        set_saving(true);
        try {
            const saved = await save_md_editor_setting(body);
            if (saved) {
                NotySuccess(t("保存成功"));
                const next: Record<string, string> = {};
                FIELDS.forEach(f => next[f.key] = saved[f.key] ?? "");
                set_values(next);
                set_theme(saved.theme ?? MD_EDITOR_SETTING_DEFAULT.theme);
            } else {
                NotyFail(t("保存失败"));
            }
        } finally {
            set_saving(false);
        }
    };

    // 删除主题
    const remove_theme = (item: md_theme_item) => {
        confirm_dell_all({
            sub_title: t("确认删除这个主题吗?"),
            confirm_fun: async () => {
                if (await del_md_theme(item.id)) {
                    NotySuccess(t("删除成功"));
                    set_themes(await load_md_theme_list());
                    // 删掉的正是当前启用主题时，回落到默认主题
                    if (theme === item.id) {
                        set_theme(MD_EDITOR_SETTING_DEFAULT.theme);
                    }
                } else {
                    NotyFail(t("删除失败"));
                }
            }
        });
    };

    const cur_theme = themes.find(i => i.id === theme);

    const reset_default = () => {
        const next: Record<string, string> = {};
        FIELDS.forEach(f => next[f.key] = MD_EDITOR_SETTING_DEFAULT[f.key]);
        set_values(next);
    };

    // 预览用：把当前输入值直接套上去，非法值退回默认值，避免预览里出现怪异样式
    const preview_value = (key: keyof md_editor_setting_pojo) => {
        const v = (values[key] ?? "").trim();
        return SIZE_RE.test(v) ? v : MD_EDITOR_SETTING_DEFAULT[key];
    };

    return <div>
        <HeaderPortal position={"right"}>
            <ActionButton icon={"arrow_back"} title={t("上一页")} onClick={() => navigate(-1)}/>
        </HeaderPortal>
        <FullScreenDiv isFull={true} more={true}>
            <FullScreenContext>
                <Dashboard>
                    <Row>
                        <Column widthPer={33} maxWidth={"30rem"}>
                            <Card title={t("编辑器设置")} titleCom={<>
                                <ButtonText text={t("恢复默认")} clickFun={reset_default}/>
                                {can_edit &&
                                    <Button text={saving ? t("保存中") : t("保存")}
                                            clickFun={() => {
                                                if (!saving) {
                                                    save();
                                                }
                                            }}/>}
                            </>}>
                                {loading
                                    ? <div className="common-box common-box-center">{t("加载中")}...</div>
                                    : <div className="md-setting-form">
                                        {/* 主题：选择当前启用的主题，右侧按钮进入编辑 / 删除 / 新建 */}
                                        <InputRow vertical label={t("主题")}>
                                            {/* 这里不用 .div-row：它带 -0.5em 负边距，会把这一行撑出容器导致左边缘与其它字段对不齐 */}
                                            <div style={{display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
                                                <Select
                                                    value={theme}
                                                    onChange={(v) => set_theme(v)}
                                                    disabled={!can_edit}
                                                    options={[
                                                        {title: t("不使用主题"), value: ""},
                                                        ...themes.map(i => ({title: i.id, value: i.id})),
                                                    ]}
                                                />
                                                <ActionButton icon={"add"} title={t("新建主题")}
                                                              onClick={() => navigate(routerConfig.md_theme_editor_page)}/>
                                                <ActionButton icon={"edit"} title={t("编辑主题")}
                                                              onClick={() => navigate(`${routerConfig.md_theme_editor_page}?id=${encodeURIComponent(theme)}`)}/>
                                                {cur_theme &&
                                                    <ActionButton icon={"delete"} title={t("删除主题")}
                                                                  onClick={() => remove_theme(cur_theme)}/>}
                                            </div>
                                        </InputRow>
                                        {FIELDS.map(f => <InputRow key={f.key} vertical label={t(f.label)}>
                                            <input className="input input--block"
                                                   type="text"
                                                   spellCheck={false}
                                                   disabled={!can_edit}
                                                   placeholder={MD_EDITOR_SETTING_DEFAULT[f.key]}
                                                   value={values[f.key] ?? ""}
                                                   onChange={(e) => set_values(prev => ({
                                                       ...prev,
                                                       [f.key]: e.target.value
                                                   }))}/>
                                        </InputRow>)}
                                        {!can_edit && <p className="md-editor-setting-page__desc">
                                            {t("nprmtp")}
                                        </p>}
                                    </div>}
                            </Card>
                        </Column>
                        <Column widthPer={50} maxWidth={"60rem"}>
                            <Card title={t("预览")}>
                                {/* 预览区：直接把当前输入值写进 CSS 变量，与实际编辑器用的是同一套变量 */}
                                <div className="md-editor-setting-page__preview"
                                     ref={(el) => apply_md_editor_setting(el, {
                                         content_max_width: preview_value("content_max_width"),
                                         content_padding: preview_value("content_padding"),
                                         font_size: preview_value("font_size"),
                                         line_height: preview_value("line_height"),
                                     })}>
                                    <div className="md-editor-setting-page__preview-sheet">
                                        <h3>{t("标题")}</h3>
                                        <p>{t("这是一段用于预览正文宽度、边距、字号和行高的示例文字。调整左侧数值即可看到这里的变化，与实际编辑器使用的是同一套样式变量。")}</p>
                                        <p>{t("第二段文字，用来更清楚地看出行高。")}</p>
                                    </div>
                                </div>
                            </Card>
                        </Column>
                    </Row>
                </Dashboard>
            </FullScreenContext>
        </FullScreenDiv>
    </div>;
}
