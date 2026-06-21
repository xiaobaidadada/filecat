import React, {useEffect, useMemo, useState} from "react";
import Header from "../../../../meta/component/Header";
import {ActionButton, ButtonText} from "../../../../meta/component/Button";
import {fileHttp} from "../../../util/config";
import {useNavigate} from "react-router-dom";
import {Table} from "../../../../meta/component/Table";
import {sqliteQueryResult} from "../../../../../common/req/file.req";
import {Card, TextTip} from "../../../../meta/component/Card";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../../util/store";
import Ace from "./Ace";
import {editor_data} from "../../../util/store.util";

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

export default function DbQuery() {
    const navigate = useNavigate();
    const [sqlite_query_context] = useAtom($stroe.sqlite_query_context);
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

    useEffect(() => {
        editor_data.set_value_temp(sql, editorId);
    }, [sql]);

    useEffect(() => {
        setSql("");
        setError("");
        setResult(null);
        setViewMode("table");
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
        try {
            const rsp = await fileHttp.post("sqlite/query", {
                path: dbPath,
                sql: query,
            });
            setResult(rsp.data);
            setViewMode("table");
        } catch (e: any) {
            setError(e?.message ?? `${e}`);
            setResult(null);
        } finally {
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
                ]}
                children={<TextTip context={dbLabel} tip_context={"点击复制数据库信息"} />}
            />

            <div className={"db-query-page__content"}>
                <Card
                    title={"SQL 查询"}
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
                    titleCom={<span>{result ? `${result.row_count} 行` : "暂无结果"}</span>}
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
