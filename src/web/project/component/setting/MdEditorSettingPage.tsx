import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useNavigate} from "react-router-dom";
import {ActionButton} from "../../../meta/component/Button";
import {HeaderPortal} from "../../../meta/component/HeaderPortal";
import {Column, Dashboard, FullScreenContext, FullScreenDiv, Row} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {InputRow} from "../../../meta/component/Input";
import {Button, ButtonText} from "../../../meta/component/Button";
import {NotyFail, NotySuccess} from "../../util/noty";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {md_editor_setting_pojo} from "../../../../common/req/common.pojo";
import {
    apply_md_editor_setting,
    load_md_editor_setting,
    MD_EDITOR_SETTING_DEFAULT,
    save_md_editor_setting,
} from "../file/component/md_editor/MdEditorSetting";

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
    // 无权限时页面降级为只读：能看当前配置，但不能改也不能保存
    const can_edit = check_user_auth(UserAuth.md_editor_setting);

    // 直接存用户输入的原始字符串，提交时再校验
    const [values, set_values] = useState<Record<string, string>>({});
    const [loading, set_loading] = useState(true);
    const [saving, set_saving] = useState(false);

    useEffect(() => {
        load_md_editor_setting().then(s => {
            const next: Record<string, string> = {};
            FIELDS.forEach(f => next[f.key] = s[f.key] ?? "");
            set_values(next);
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
        set_saving(true);
        try {
            const saved = await save_md_editor_setting(body);
            if (saved) {
                NotySuccess(t("保存成功"));
                const next: Record<string, string> = {};
                FIELDS.forEach(f => next[f.key] = saved[f.key] ?? "");
                set_values(next);
            } else {
                NotyFail(t("保存失败"));
            }
        } finally {
            set_saving(false);
        }
    };

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
                                    : <React.Fragment>
                                        {FIELDS.map(f => <InputRow key={f.key} label={t(f.label)}
                                                                   label_width={"8rem"}>
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
                                            {t("你没有修改该设置的权限，以下为当前配置。")}
                                        </p>}
                                    </React.Fragment>}
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
