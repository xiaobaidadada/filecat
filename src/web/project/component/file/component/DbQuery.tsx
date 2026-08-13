import React, {useContext, useEffect, useMemo, useState} from "react";
import Header from "../../../../meta/component/Header";
import {ActionButton, ButtonText} from "../../../../meta/component/Button";
import {fileHttp, userHttp} from "../../../util/config";
import {useNavigate} from "react-router-dom";
import {Table} from "../../../../meta/component/Table";
import {sqliteQueryResult} from "../../../../../common/req/file.req";
import {Card, TextTip} from "../../../../meta/component/Card";
import { useAtom } from 'jotai';
import {$stroe} from "../../../util/store";
import Ace from "./Ace";
import {editor_data} from "../../../util/store.util";
import {InputText, Select} from "../../../../meta/component/Input";
import {SqlPresetItem, SqlReplaceItem} from "../../../../../common/req/setting.req";
import {Http_controller_router} from "../../../../../common/req/http_controller_router";
import {NotySuccess} from "../../../util/noty";
import {useTranslation} from "react-i18next";
import {RCode} from "../../../../../common/Result.pojo";
import {GlobalContext} from "../../../GlobalProvider";
import Timer from "../../../../meta/component/Timer";
import {routerConfig} from "../../../../../common/RouterConfig";

type ViewMode = "table" | "json";

function formatCell(value: any) {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return `${value}`;
}

// 创建新预设时的备注输入弹窗内容（独立组件持有内部输入状态）
function SqlPresetNoteInput(props: {
    placeholder: string;
    confirmText: string;
    onConfirm: (note: string) => void;
}) {
    const [note, setNote] = useState("");
    return (
        <div className="db-query-preset-input">
            <InputText
                placeholder={props.placeholder}
                value={note}
                handleInputChange={setNote}
            />
            <div className="db-query-preset-input__actions">
                <ButtonText text={props.confirmText} clickFun={() => props.onConfirm(note.trim())} />
            </div>
        </div>
    );
}

export default function DbQuery() {
    const navigate = useNavigate();
    const {t} = useTranslation();
    const {initUserInfo} = useContext(GlobalContext);
    const [sqlite_query_context] = useAtom($stroe.sqlite_query_context);
    const [user_base_info] = useAtom($stroe.user_base_info);
    const [, set_prompt_card] = useAtom($stroe.prompt_card);
    const dbPath = useMemo(() => sqlite_query_context?.path ?? "", [sqlite_query_context?.path]);
    const dbLabel = useMemo(() => {
        if (!sqlite_query_context?.path) {
            return "未选择数据库";
        }
        return `${sqlite_query_context?.name || "数据库"} | ${sqlite_query_context.path}`;
    }, [sqlite_query_context?.name, sqlite_query_context?.path]);
    const editorId = 97;

    const [sql, setSql] = useState("");
    const [viewMode, setViewMode] = useState<ViewMode>("table");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<sqliteQueryResult | null>(null);
    // 查询计时：是否正在计时、计时轮次、是否已发起过查询
    const [timerRunning, setTimerRunning] = useState(false);
    const [timerKey, setTimerKey] = useState(0);
    const [hasQuery, setHasQuery] = useState(false);

    // ===== SQL 查询预设 =====
    const defaultSqlPreset = () => ({
        index: 0,
        note: t("查询全部表"),
        sql: "SELECT name, type FROM sqlite_master WHERE type='table';",
    });
    // 当前用户的 SQL 预设列表
    const [sqlPresets, setSqlPresets] = useState<SqlPresetItem[]>([]);
    // 下拉选中的预设下标，-1 表示未选中（处于"新建"状态）
    const [selectedPreset, setSelectedPreset] = useState<number>(-1);

    // 从当前用户的数据中加载 SQL 预设，若没有则用一条默认值
    useEffect(() => {
        const list = user_base_info?.user_data?.sql_preset_list;
        if (list && list.length) {
            setSqlPresets([...list]);
        } else {
            setSqlPresets([defaultSqlPreset()]);
        }
    }, [user_base_info?.user_data?.sql_preset_list]);

    // 把一段 SQL 填入 Ace 编辑器并同步内部 state
    const setEditorSql = (value: string) => {
        editor_data.set_value_temp(value, editorId);
        const editor = editor_data.get_editor(editorId);
        if (editor) {
            editor.setValue(value, -1);
        }
        setSql(value);
    };

    // 保存当前用户 SQL 预设到后端，并同步本地 user_data
    const savePresetList = async (list: SqlPresetItem[]) => {
        const withIndex = list.map((item, i) => ({...item, index: i}));
        const rsp = await userHttp.post(Http_controller_router.user_save_private_attr, {
            is_sql_preset: true,
            sql_preset_list: withIndex,
        });
        if (rsp?.code !== RCode.Success) return false;
        await initUserInfo();
        setSqlPresets(withIndex);
        return true;
    };

    // 点击某个预设：将其 SQL 填入编辑器并标记为选中
    const applyPresetSql = (idx: number) => {
        const item = sqlPresets[idx];
        if (!item) return;
        setSelectedPreset(idx);
        setEditorSql(item.sql);
        setError("");
    };

    // "创建新预选项" / "更新保存"：把当前编辑器里的 SQL 保存为预设
    const handleSavePreset = async () => {
        const query = (editor_data.get_editor_value(editorId) ?? sql).trim();
        if (!query) {
            setError(t("请输入 SQL 语句"));
            return;
        }
        const list = [...sqlPresets];
        if (selectedPreset >= 0 && list[selectedPreset]) {
            // 更新当前选中的预设
            list[selectedPreset].sql = query;
            if (!list[selectedPreset].note) {
                list[selectedPreset].note = t("SQL 预设");
            }
            const ok = await savePresetList(list);
            if (ok) NotySuccess(t("更新成功"));
        } else {
            // 新建一个预设：先让用户输入备注，再保存
            set_prompt_card({
                open: true,
                title: t("创建新预选项"),
                context_div: (
                    <SqlPresetNoteInput
                        placeholder={t("请输入备注")}
                        confirmText={t("确认")}
                        onConfirm={(note) => doCreatePreset(query, note)}
                    />
                ),
                cancel: () => set_prompt_card({open: false}),
            });
        }
    };

    // 确认新建预设：把 SQL 与备注一起保存为新的一条预设
    const doCreatePreset = async (query: string, note: string) => {
        const list = [...sqlPresets, {note: note || t("SQL 预设"), sql: query} as SqlPresetItem];
        const ok = await savePresetList(list);
        if (ok) {
            set_prompt_card({open: false});
            NotySuccess(t("创建成功"));
            setSelectedPreset(list.length - 1); // 指向新建的这一条
        }
    };

    // ===== 字符串替换查询 =====
    // 当前用户的字符串替换规则
    const [replaceRules, setReplaceRules] = useState<SqlReplaceItem[]>([]);
    // 选中的替换规则下标，-1 表示未选择（不使用替换）
    const [selectedReplace, setSelectedReplace] = useState<number>(-1);
    // 替换输入框的值（将 SQL 中匹配的字符串替换为该值）
    const [replaceValue, setReplaceValue] = useState("");

    // 从当前用户数据中加载字符串替换规则
    useEffect(() => {
        const list = user_base_info?.user_data?.sql_replace_list;
        setReplaceRules(list?.length ? [...list] : []);
        setSelectedReplace(-1);
        setReplaceValue("");
    }, [user_base_info?.user_data?.sql_replace_list]);

    // 根据选中的替换规则，对 SQL 做字符串替换（大小写敏感）
    const applyReplace = (sqlText: string): string => {
        if (selectedReplace < 0 || !replaceRules[selectedReplace]) {
            return sqlText;
        }
        const pattern = replaceRules[selectedReplace].pattern;
        if (!pattern) {
            return sqlText;
        }
        try {
            return sqlText.replace(new RegExp(pattern, "g"), replaceValue);
        } catch (e) {
            throw new Error(t("替换规则正则错误"));
        }
    };

    // 跳转到 SQL 预设设置独立页面
    const goPresetSetting = () => {
        navigate(routerConfig.sql_preset_setting_page);
    };

    useEffect(() => {
        editor_data.set_value_temp(sql, editorId);
    }, [sql]);

    useEffect(() => {
        setSql("");
        setError("");
        setResult(null);
        setViewMode("table");
        setTimerRunning(false);
        setHasQuery(false);
        setTimerKey(0);
        editor_data.set_value_temp("", editorId);
        if (!dbPath) {
            setError("请先从文件右键打开一个数据库");
        }
    }, [dbPath, sqlite_query_context?.open]);

    const runQuery = async () => {
        const query = (editor_data.get_editor_value(editorId) ?? sql).trim();
        if (!dbPath) {
            setError("请先从文件右键打开一个数据库");
            setResult(null);
            return;
        }
        if (!query) {
            setError("请输入 SQL 语句");
            setResult(null);
            return;
        }
        setLoading(true);
        setError("");
        // 开启实时计时：重置轮次使其从 0 重新开始，并标记为计时中
        setHasQuery(true);
        setTimerKey(prev => prev + 1);
        setTimerRunning(true);
        try {
            // 若选中了字符串替换规则，先对 SQL 做替换再请求
            const finalSql = applyReplace(query);
            const rsp = await fileHttp.post("sqlite/query", {
                path: dbPath,
                sql: finalSql,
            });
            setResult(rsp.data);
            setViewMode("table");
        } catch (e: any) {
            setError(e?.message ?? `${e}`);
            setResult(null);
        } finally {
            setTimerRunning(false); // 查询结束，停止计时并保留总耗时
            setLoading(false);
        }
    };

    const syncEditorValue = () => {
        const value = editor_data.get_editor_value(editorId) ?? "";
        setSql(value);
    };

    const clearSql = () => {
        editor_data.set_value_temp("", editorId);
        const editor = editor_data.get_editor(editorId);
        if (editor) {
            editor.setValue("", -1);
        }
        setSql("");
    };

    const columns = result?.columns?.length ? result.columns : Object.keys(result?.rows?.[0] ?? {});
    const tableRows = (result?.rows ?? []).map((row) => columns.map((column) => formatCell(row[column])));

    return (
        <div className={"db-query-page"}>
            <Header
                ignore_tags={true}
                left_children={[
                    <ActionButton key={"back"} icon={"arrow_back"} title={"返回"} onClick={() => navigate(-1)} />,
                    <ActionButton key={"run"} icon={"play_arrow"} title={"执行"} onClick={runQuery} />,
                    <ActionButton
                        key={"table"}
                        icon={"table_chart"}
                        title={"表格视图"}
                        onClick={() => setViewMode("table")}
                    />,
                    <ActionButton
                        key={"json"}
                        icon={"data_object"}
                        title={"原 JSON"}
                        onClick={() => setViewMode("json")}
                    />,
                    <ActionButton
                        key={"preset-setting"}
                        icon={"settings"}
                        title={t("SQL预设设置")}
                        onClick={goPresetSetting}
                    />,
                ]}
                children={<TextTip context={dbLabel} tip_context={"点击复制数据库信息"} />}
            />

            <div className={"db-query-page__content"}>
                <Card
                    title={"SQL 查询"}
                    titleCom={
                        <div className={"db-query-page__preset-bar"}>
                            {replaceRules.length > 0 && (
                                <Select
                                    width={"12rem"}
                                    tip={t("字符串替换")}
                                    value={selectedReplace}
                                    onChange={(idx) => {
                                        setSelectedReplace(idx as number);
                                        setReplaceValue("");
                                    }}
                                    options={replaceRules.map((v, i) => ({
                                        value: i,
                                        title: `${v.note || v.pattern.slice(0, 20)}`,
                                    }))}
                                />
                            )}
                            {selectedReplace >= 0 && (
                                <InputText
                                    placeholder={t("替换为")}
                                    value={replaceValue}
                                    handleInputChange={setReplaceValue}
                                    width={"12rem"}
                                />
                            )}
                            {sqlPresets.length > 0 && (
                                <Select
                                    width={"16rem"}
                                    tip={t("SQL预设")}
                                    value={selectedPreset}
                                    onChange={applyPresetSql}
                                    options={sqlPresets.map((v, i) => ({
                                        value: i,
                                        title: `${v.note || v.sql.slice(0, 24)}`,
                                    }))}
                                />
                            )}
                            <ButtonText
                                text={selectedPreset >= 0 ? t("更新保存") : t("创建新预选项")}
                                clickFun={handleSavePreset}
                            />
                        </div>
                    }
                    rightBottomCom={(
                        <div className={"db-query-page__actions"}>
                            <ButtonText text={loading ? "查询中..." : "执行查询"} clickFun={runQuery}/>
                            <ButtonText text={"清空"} clickFun={clearSql}/>
                            <ButtonText
                                text={viewMode === "table" ? "表格视图" : "切换到表格"}
                                clickFun={() => setViewMode("table")}
                            />
                            <ButtonText
                                text={viewMode === "json" ? "原 JSON" : "切换到 JSON"}
                                clickFun={() => setViewMode("json")}
                            />
                        </div>
                    )}
                >
                    <div className={"db-query-page__editor"}>
                        <Ace
                            name={"sqlite.sql"}
                            editor_id={editorId}
                            model={"ace/mode/sql"}
                            on_change={syncEditorValue}
                            options={{
                                showPrintMargin: false,
                                highlightActiveLine: true,
                                wrap: true,
                            }}
                        />
                    </div>
                    {error && <div className={"db-query-page__error"}>{error}</div>}
                </Card>

                <Card
                    title={"查询结果"}
                    titleCom={
                        <span className={"db-query-page__result-meta"}>
                            {result ? `${result.row_count} 行` : "暂无结果"}
                            {hasQuery && (
                                <span className={"db-query-page__elapsed"}>
                                    <Timer
                                        running={timerRunning}
                                        resetKey={timerKey}
                                        prefix={`${t("耗时")}: `}
                                        format="auto"
                                    />
                                </span>
                            )}
                        </span>
                    }
                >
                    {result && viewMode === "table" && (
                        <Table
                            headers={columns}
                            rows={tableRows}
                        />
                    )}
                    {result && viewMode === "json" && (
                        <pre className={"db-query-page__result-json"}>
                            {JSON.stringify(result.rows, null, 2)}
                        </pre>
                    )}
                    {!result && !error && (
                        <div className={"db-query-page__hint"}>
                            先输入查询语句，再执行。支持 `select`、`with`、`pragma`、`explain`。
                        </div>
                    )}
                    {!result && error && (
                        <div className={"db-query-page__hint"}>
                            {error}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
