import React, {useEffect, useState} from 'react'
import {Blank} from "../../../meta/component/Blank";
import {Column, Dashboard, DropdownTag, Row, RowColumn} from '../../../meta/component/Dashboard';
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import {Table} from "../../../meta/component/Table";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {staticSysPojo, SysPojo} from "../../../../common/req/sys.pojo";
import {InputText} from "../../../meta/component/Input";
import {ActionButton, Button, ButtonText} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {DockerShell} from "../shell/DockerShell";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {sort} from "../../../../common/ListUtil";
import {PromptEnum} from "../prompts/Prompt";
import {useTranslation} from "react-i18next";

let filter = ""



export function Docker(props) {
    const { t } = useTranslation();

    const [shellShow, setShellShow] = useRecoilState($stroe.dockerShellShow);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [filterKey,setFilterKey] = useState("");
    const [headers, setHeaders] = useState(["id", t("名字"), t("镜像"), t("命令"), t("状态"),t("内存"),"cpu%", t("选择")]);
    const [rows, setRows] = useState([]);
    const [optRow, setOptRow] = useState([]);
    const [count, setCount] = useState(0);
    const init = async () => {
        const data = new WsData(CmdType.docker_get);
        await ws.send(data)
        ws.addMsg(CmdType.docker_getting, (wsData: WsData<SysPojo>) => {
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
            for (let index = 0; index < renders.length; index++) {
                const row = renders[index];
                for (let index2 = 0; index2 < row.length; index2++) {
                    row[index2] = (<TextTip context={row[index2]}/>)
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
        setFilterKey(filter);
        init();
        return () => {
            (async () => {
                setShellShow({show: false, type: "", dockerId: ''})
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
    const closeGet = () => {
        if (ws.isAilive()) {
            ws.setPromise(async (resolve) => {
                const data2 = new WsData(shellShow.type === "logs" ? CmdType.docker_shell_logs_cancel : CmdType.docker_shell_exec_cancel);
                data2.context = ""
                await ws.send(data2);
                resolve();
            })
        }
    }
    const logs = () => {
        if (shellShow.show) {
            setShellShow({show: false, type: "", dockerId: ''})
            closeGet()
        } else {
            setShellShow({show: true, dockerId: optRow[0].props.context, type: "logs"});
        }
    }
    const exec = () => {
        if (shellShow.show) {
            setShellShow({show: false, type: "", dockerId: ''})
            closeGet()
        } else {
            setShellShow({show: true, dockerId: optRow[0].props.context, type: "exec"});
        }
    }
    const dswitch = (type) => {
        const obj = new WsData(CmdType.docker_switch);
        obj.context = {
            type: type,
            dockerId: optRow[0].props.context,
        };
        setOptRow([])
        ws.send(obj);
    }
    const del = ()=> {
        setShowPrompt({show:true,overlay:true,type:PromptEnum.DockerDel,data:{dockerId: optRow[0].props.context,name: optRow[1].props.context,}})
    }
    return <div>
        <Header>
            {optRow.length > 0 && <div>
                {optRow[1].props.context}
            </div>}
            {optRow.length > 0 && <div>
                <ActionButton icon={"delete"} title={"删除容器"} onClick={del}/>
                <ActionButton icon={"print"} title={"打印日志"} onClick={logs}/>
                <ActionButton icon={"personal_video"} title={"执行命令"} onClick={exec}/>
                {optRow[4].props.context.includes("Up") ? (
                    <ActionButton icon={"stop"} title={"停止"} onClick={() => dswitch("stop")}/>) :
                    <ActionButton icon={"play_arrow"} title={"开启"} onClick={() => {dswitch("start")}}
                         />}
            </div>}

        </Header>
        <Dashboard>

            {rows.length === 0 && !filter ? (<Blank context={"主机需要安装docker"}/>) : (
                <Row>
                    <Column widthPer={80}>
                        <CardFull title={`容器(${count})`}
                                  titleCom={<InputText placeholder={"过滤"} value={filterKey}  handleInputChange={(value) => {
                                      setFilterKey(value)
                                  }}/>}>
                            <Table headers={headers} rows={rows} width={"10rem"}/>
                        </CardFull>
                    </Column>
                </Row>
            )}

        </Dashboard>
        <DockerShell/>
    </div>


}
