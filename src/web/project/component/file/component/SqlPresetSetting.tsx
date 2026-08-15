import React, {useContext, useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import Header from "../../../../meta/component/Header";
import {ActionButton} from "../../../../meta/component/Button";
import {Column, Dashboard, FullScreenContext, FullScreenDiv, Row} from "../../../../meta/component/Dashboard";
import {Table} from "../../../../meta/component/Table";
import {CardFull} from "../../../../meta/component/Card";
import {InputText} from "../../../../meta/component/Input";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {userHttp} from "../../../util/config";
import {Http_controller_router} from "../../../../../common/req/http_controller_router";
import {RCode} from "../../../../../common/Result.pojo";
import {NotySuccess} from "../../../util/noty";
import {GlobalContext} from "../../../GlobalProvider";
import {editor_data} from "../../../util/store.util";
import {SqlPresetItem} from "../../../../../common/req/setting.req";
import {useNavigate} from "react-router-dom";

// 默认 SQL 预设：查询 sqlite 全部表信息
export function defaultSqlPreset(t: (key: string) => string): SqlPresetItem {
    return {index: 0, note: t("查询全部表"), sql: "SELECT name, type FROM sqlite_master WHERE type='table';"};
}

// SQL 预设 env 默认模板（ini 格式，带注释说明怎么填）
export const sqlEnvDefault = `# 可选：设置 SQL 中的"替换词"（在查询页选中该预设后，会显示输入框）
# 例子：SQL 为  SELECT * FROM t WHERE id = 123456 ，请填写下面的 find=123456
# 这样查询页输入新值即可把 SQL 中的 123456 替换掉后再查询
find=`;

/**
 * SQL 设置独立页面（路由访问）
 * 行内编辑（参考 AI 设置页面）：
 * - 备注：InputText 行内直接编辑
 * - SQL代码 / env：用 ActionButton 唤起 Ace 文本编辑器编辑（model=ace/mode/sql、ace/mode/ini）
 *   env 为通用 key=value 配置文本（如 find=替换词），当前查询侧读取 find 键做占位符替换，后续可扩展其他属性
 * 配置保存在当前用户个人数据中（user_data.sql_preset_list）
 */
export default function SqlPresetSetting() {
    const {t} = useTranslation();
    const {initUserInfo} = useContext(GlobalContext);
    const [, setEditorSetting] = useAtom($stroe.editorSetting);
    const [user_base_info] = useAtom($stroe.user_base_info);
    const navigate = useNavigate();
    // 记录正在编辑的预设下标，供 Ace 保存回调使用
    const editingIndexRef = React.useRef<number>(-1);

    const [presets, setPresets] = useState<SqlPresetItem[]>([]);

    // 从当前用户数据中加载预设
    useEffect(() => {
        const pd = user_base_info?.user_data?.sql_preset_list;
        setPresets(pd?.length ? [...pd] : [defaultSqlPreset(t)]);
    }, [t, user_base_info?.user_data?.sql_preset_list]);

    // 保存 SQL 预设到当前用户
    const savePresets = async () => {
        const withIndex = presets.map((item, i) => ({...item, index: i}));
        const rsp = await userHttp.post(Http_controller_router.user_save_private_attr, {
            is_sql_preset: true,
            sql_preset_list: withIndex,
        });
        if (rsp?.code !== RCode.Success) return;
        await initUserInfo();
        NotySuccess(t("保存成功"));
    };

    // 用 Ace 文本编辑器编辑某条预设的字段（sql / env）
    const editField = (index: number, field: "sql" | "env") => {
        editingIndexRef.current = index;
        const value = presets[index][field] ?? "";
        editor_data.set_value_temp(value);
        setEditorSetting({
            model: field === "sql" ? "ace/mode/sql" : "ace/mode/ini",
            open: true,
            fileName: "",
            save: async (context: string) => {
                const item = presets[editingIndexRef.current];
                item[field] = context;
                setPresets([...presets]);
                editor_data.set_value_temp("");
                savePresets()
            },
        });
    };

    const headers_preset = [t("编号"), t("备注"), t("SQL代码"), t("env编辑"), t("操作")];

    return (
        <div>
            <Header>
                <ActionButton icon={"arrow_back"} title={t("返回")} onClick={() => navigate(-1)} />
            </Header>
            <FullScreenDiv isFull={true} more={true}>
                <FullScreenContext>
                    <Dashboard>
                        <Row>
                            <Column widthPer={60}>
                                <CardFull self_title={<span className={"div-row"}><h2>{t("SQL 预设")}</h2></span>} titleCom={
                                    <div className={"db-query-setting__toolbar"}>
                                        <ActionButton icon={"add"} title={t("添加")}
                                                      onClick={() => setPresets([...presets, {note: "", sql: "", env: sqlEnvDefault} as SqlPresetItem])} />
                                        <ActionButton icon={"save"} title={t("保存")} onClick={() => savePresets()} />
                                    </div>
                                }>
                                    <Table headers={headers_preset} rows={presets.map((item, index) => [
                                        <div>{index + 1}</div>,
                                        <InputText value={item.note} no_border={true}
                                                   placeholder={t("备注")}
                                                   handleInputChange={(v) => { item.note = v; setPresets([...presets]); }} />,
                                        <div>
                                            <ActionButton icon={"short_text"} title={t("编辑SQL")}
                                                          onClick={() => editField(index, "sql")} />
                                        </div>,
                                        <div>
                                            <ActionButton icon={"settings"} title={t("env编辑")}
                                                          onClick={() => editField(index, "env")} />
                                        </div>,
                                        <div>
                                            <ActionButton icon={"delete"} title={t("删除")}
                                                          onClick={() => { presets.splice(index, 1); setPresets([...presets]); }} />
                                        </div>,
                                    ])} width={"8rem"} />
                                </CardFull>
                            </Column>
                        </Row>
                    </Dashboard>
                </FullScreenContext>
            </FullScreenDiv>
        </div>
    );
}


