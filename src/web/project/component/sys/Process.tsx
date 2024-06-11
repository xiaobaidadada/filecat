import React, {useEffect, useRef, useState} from 'react'
import {Blank} from "../../../meta/component/Blank";
import {Column, Dashboard, Dropdown, Row, RowColumn} from '../../../meta/component/Dashboard';
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import {Table} from "../../../meta/component/Table";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {InputText} from "../../../meta/component/Input";
import {ActionButton, Button, ButtonText} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {formatFileSize} from "../../../../common/ValueUtil";
import {sort} from "../../../../common/ListUtil";

let filter = ""
let sortMem = false;
let sortCpu = false;
export function Process(props) {
    const [rows, setRows] = useState([]);
    const [optRow, setOptRow] = useState([]);
    const [count, setCount] = useState(0);
    const [filterKey,setFilterKey] = useState("");
    const [headers, setHeaders] = useState(["pid", "名字","创建用户",
        (<span>内存<ActionButton icon={"sort"} title={"升序"}  onClick={()=>{
            sortMem=!sortMem;
        }}/></span>)
        ,(<span>cpu%<ActionButton icon={"sort"} title={"升序"}  onClick={()=>{
            sortCpu=!sortCpu;
        }}/></span>),
        "选择",]);

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
                row.push((<ActionButton icon={"place"} title={"选中"} onClick={() => {
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
                        const data = new WsData(CmdType.docker_cancel);
                        await ws.send(data)
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
            <title><h3>FileCat</h3></title>
            {optRow.length > 0 && <div>
                {optRow[1].props.context}
            </div>}
            {optRow.length > 0 && <div>
                <ActionButton icon={"stop"} title={"停止"} onClick={close}/>
            </div>}

        </Header>
        <Dashboard>
            {rows.length === 0 && !filter ? (<Blank context={"在主机上无法找到获取进程的系统工具"}/>) : (
                <Row>
                    <Column widthPer={80}>
                        <CardFull title={`进程(${count})`}
                                  titleCom={<InputText placeholder={"过滤"} value={filterKey} handleInputChange={(value) => {
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
