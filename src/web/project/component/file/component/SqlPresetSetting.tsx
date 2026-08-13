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
import {SqlPresetItem, SqlReplaceItem} from "../../../../../common/req/setting.req";
import {useNavigate} from "react-router-dom";

// 默认 SQL 预设：查询 sqlite 全部表信息
export function defaultSqlPreset(t: (key: string) => string): SqlPresetItem {
    return {index: 0, note: t("查询全部表"), sql: "SELECT name, type FROM sqlite_master WHERE type='table';"};
}

/**
 * SQL 设置独立页面（路由访问）
 * - SQL 查询预设：序号 / 备注 / SQL代码（用 Ace 编辑器编辑）
 * - 字符串替换规则：序号 / 备注 / 正则匹配字符串（大小写敏感）
 * 配置保存在当前用户个人数据中（user_data.sql_preset_list / sql_replace_list）
 */
export default function SqlPresetSetting() {
    const {t} = useTranslation();
    const {initUserInfo} = useContext(GlobalContext);
    const [, setEditorSetting] = useAtom($stroe.editorSetting);
    const [user_base_info] = useAtom($stroe.user_base_info);
    const navigate = useNavigate();

    const [presets, setPresets] = useState<SqlPresetItem[]>([]);
    const [replaces, setReplaces] = useState<SqlReplaceItem[]>([]);

    // 从当前用户数据中加载预设与替换规则
    useEffect(() => {
        const pd = user_base_info?.user_data?.sql_preset_list;
        const rp = user_base_info?.user_data?.sql_replace_list;
        setPresets(pd?.length ? [...pd] : [defaultSqlPreset(t)]);
        setReplaces(rp?.length ? [...rp] : [{note: "", pattern: ""}] as SqlReplaceItem[]);
    }, [t, user_base_info?.user_data?.sql_preset_list, user_base_info?.user_data?.sql_replace_list]);

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

    // 保存字符串替换规则到当前用户
    const saveReplaces = async () => {
        const withIndex = replaces.map((item, i) => ({...item, index: i}));
        const rsp = await userHttp.post(Http_controller_router.user_save_private_attr, {
            is_sql_replace: true,
            sql_replace_list: withIndex,
        });
        if (rsp?.code !== RCode.Success) return;
        await initUserInfo();
        NotySuccess(t("保存成功"));
    };

    // 用 Ace 文本编辑器编辑 SQL 代码
    const editSql = (index: number) => {
        editor_data.set_value_temp(presets[index].sql ?? "");
        setEditorSetting({
            model: "ace/mode/sql",
            open: true,
            fileName: "",
            save: async (context: string) => {
                presets[index].sql = context;
                setPresets([...presets]);
                editor_data.set_value_temp("");
            },
        });
    };

    const headers_preset = [t("编号"), t("备注"), t("SQL代码"), t("操作")];
    const headers_replace = [t("编号"), t("备注"), t("正则匹配字符串"), t("操作")];

    return (
        <div>
            <Header>
                <ActionButton icon={"arrow_back"} title={t("返回")} onClick={() => navigate(-1)} />
            </Header>
            <FullScreenDiv isFull={true} more={true}>
                <FullScreenContext>
                    <Dashboard>
                        <Row>
                            <Column widthPer={50}>
                                <CardFull self_title={<span className={"div-row"}><h2>{t("SQL 预设")}</h2></span>} titleCom={
                                    <div className={"db-query-setting__toolbar"}>
                                        <ActionButton icon={"add"} title={t("添加")}
                                                      onClick={() => setPresets([...presets, {note: "", sql: ""} as SqlPresetItem])} />
                                        <ActionButton icon={"save"} title={t("保存")} onClick={() => savePresets()} />
                                    </div>
                                }>
                                    <Table headers={headers_preset} rows={presets.map((item, index) => [
                                        <div>{index + 1}</div>,
                                        <InputText value={item.note} no_border={true}
                                                   handleInputChange={(v) => { item.note = v; setPresets([...presets]); }} />,
                                        <div>
                                            <ActionButton icon={"short_text"} title={t("编辑SQL")} onClick={() => editSql(index)} />
                                        </div>,
                                        <div>
                                            <ActionButton icon={"delete"} title={t("删除")}
                                                          onClick={() => { presets.splice(index, 1); setPresets([...presets]); }} />
                                        </div>,
                                    ])} width={"8rem"} />
                                </CardFull>
                            </Column>
                            <Column widthPer={50}>
                                <CardFull self_title={<span className={"div-row"}><h2>{t("字符串替换查询")}</h2></span>} titleCom={
                                    <div className={"db-query-setting__toolbar"}>
                                        <ActionButton icon={"add"} title={t("添加")}
                                                      onClick={() => setReplaces([...replaces, {note: "", pattern: ""} as SqlReplaceItem])} />
                                        <ActionButton icon={"save"} title={t("保存")} onClick={() => saveReplaces()} />
                                    </div>
                                }>
                                    <Table headers={headers_replace} rows={replaces.map((item, index) => [
                                        <div>{index + 1}</div>,
                                        <InputText value={item.note} no_border={true}
                                                   handleInputChange={(v) => { item.note = v; setReplaces([...replaces]); }} />,
                                        <InputText value={item.pattern} no_border={true}
                                                   handleInputChange={(v) => { item.pattern = v; setReplaces([...replaces]); }} />,
                                        <div>
                                            <ActionButton icon={"delete"} title={t("删除")}
                                                          onClick={() => { replaces.splice(index, 1); setReplaces([...replaces]); }} />
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
