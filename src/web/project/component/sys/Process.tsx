import React, {useEffect, useState} from 'react'
import {Blank} from "../../../meta/component/Blank";
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard';
import {CardFull, TextTip} from "../../../meta/component/Card";
import {Table} from "../../../meta/component/Table";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {InputText} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {formatFileSize} from "../../../../common/ValueUtil";
import {sort} from "../../../../common/ListUtil";
import {useTranslation} from "react-i18next";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";

let filter = ""
let sortMem = false;
let sortCpu = false;
export function Process(props) {
    const { t } = useTranslation();

    const [rows, setRows] = useState([]);
    const [optRow, setOptRow] = useState([]);
    const [count, setCount] = useState(0);
    const [filterKey,setFilterKey] = useState("");
    const [headers, setHeaders] = useState(["pid", t("名字"),t("创建用户"),
        (<span>{t("内存")}<ActionButton icon={"sort"} title={t("升序")}  onClick={()=>{
            sortMem=!sortMem;
        }}/></span>)
        ,(<span>cpu%<ActionButton icon={"sort"} title={t("升序")}  onClick={()=>{
            sortCpu=!sortCpu;
        }}/></span>),
        t("选择"),]);
    const {check_user_auth} = use_auth_check();

    const init = async () => {
        const data = new WsData(CmdType.process_get);
        await ws.send(data)
        ws.addMsg(CmdType.process_getting, (wsData: WsData<any>) => {
            const renders: any[] = [];
            if (filter) {
                for (const row of wsData.context) {
                    for (const col of row) {
                        if (`${col}`.includes(filter)) {
                            renders.push(row);
                            break;
                        }
                    }
                }

            } else {
                renders.push(...wsData.context);
            }
            if (sortMem) {
                sort(renders,(v)=>v[3],false)
            }
            if (sortCpu) {
                sort(renders,(v)=>v[4],false)
            }
            for (let index = 0; index < renders.length; index++) {
                const row = renders[index];
                for (let index2 = 0; index2 < row.length; index2++) {
                    row[index2] = (<TextTip context={index2===3?formatFileSize(row[index2]):row[index2]}/>);
                }
                row.push((<ActionButton icon={"place"} title={t("选中")} onClick={() => {
                    setOptRow(row);
                }}/>))
            }
            setCount(renders.length)
            setRows(renders)
        })
    }
    useEffect(() => {
        setFilterKey(filter)
        init();
        return () => {
            (async () => {
                if (ws.isAilive()) {
                    ws.setPromise(async (resolve) => {
                        await ws.unConnect();
                        resolve();
                    });
                }
            })();
        }
    }, []);
    useEffect(() => {
        filter = filterKey;
    }, [filterKey]);
    const close = () => {
        const obj = new WsData(CmdType.process_close);
        obj.context = {pid: optRow[0].props.context};
        setOptRow([])
        ws.send(obj);
    }
    return <div>
        <Header>
            {optRow.length > 0 && <div>
                {optRow[1].props.context}
            </div>}
            {(optRow.length > 0 && check_user_auth(UserAuth.sys_process_close)) && <div>
                <ActionButton icon={"stop"} title={t("停止")} onClick={close}/>
            </div>}

        </Header>
        <Dashboard>
            {rows.length === 0 && !filter ? (<Blank context={t("加载中请等待...")}/>) : (
                <Row>
                    <Column widthPer={80}>
                        <CardFull title={`${t('进程')} (${count})`}
                                  titleCom={<InputText placeholder={t("过滤")} value={filterKey} handleInputChange={(value) => {
                                      setFilterKey(value);
                                  }}/>}>
                            <Table headers={headers} rows={rows} width={"10rem"}/>
                        </CardFull>
                    </Column>
                </Row>
            )}

        </Dashboard>
    </div>


}
