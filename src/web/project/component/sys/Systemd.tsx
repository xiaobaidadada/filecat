import React, {useEffect, useState} from 'react'
import {Blank} from "../../../meta/component/Blank";
import {Column, Dashboard, Row, RowColumn} from '../../../meta/component/Dashboard';
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import {Table} from "../../../meta/component/Table";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {DiskDevicePojo, staticSysPojo, SysPojo} from "../../../../common/req/sys.pojo";
import {InputText, InputTextIcon} from "../../../meta/component/Input";
import {ActionButton, Button, ButtonLittleStatus, ButtonText} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {DockerShell} from "../shell/DockerShell";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {useTranslation} from "react-i18next";
import {formatFileSize} from "../../../../common/ValueUtil";
import {fileHttp, sshHttp, sysHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySucess} from "../../util/noty";
import {saveTxtReq} from "../../../../common/req/file.req";
import {getRouterAfter} from "../../util/WebPath";
import {SystemdShell} from "../shell/SystemdShell";
import {editor_data} from "../../util/store.util";

let filter = ""


let systemd_rows_p;
export function Systemd(props) {
    const { t } = useTranslation();

    const [shellShow, setShellShow] = useRecoilState($stroe.systemd_shell_show);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);

    const [headers, setHeaders] = useState(["pid","name","process", t("创建用户"),t("内存"), t("cpu%"),t("active状态"), t("选择")]);
    const [systemd_headers, set_systemd_headers] = useState(["单元名字","加载状态", t("active(sub)状态"),t("描述"), t("选择")]);
    const [rows, setRows] = useState([]);
    const [systemd_rows, set_systemd_rows] = useState([]);
    const [optRow, setOptRow] = useState([]);

    const [systemd,setSystemd] = useState(false); // 展示什么界面

    const [systemd_opt_row,set_systemd_opt_row] = useState([]);

    // 系统单元过滤
    const [systemd_filterkey,set_systemd_filterkey] = useState("");
    const [filterKey,setFilterKey] = useState("");
    const [inside_systemd,set_inside_systemd] = useState(new Set());

    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)

    const init = async () => {
        const data = new WsData(CmdType.systemd_inside_get);
        await ws.send(data)
        ws.addMsg(CmdType.systemd_inside_getting, (wsData: WsData<any>) => {
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
                    row[index2] = (<TextTip context={index2===4?formatFileSize(row[index2]):row[index2]}/>); // 内存计算
                }
                row.push((<ActionButton icon={"place"} title={"选中"} onClick={() => {
                    setOptRow(row);
                }}/>))

            }
            setRows(renders)
        })
    }
    useEffect(() => {
        setFilterKey(filter);
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
    const closeGet = () => {
    }
    const logs = (name) => {
        if (shellShow.show) {
            setShellShow({show: false, unit_name: ""})
            const event = new CustomEvent('cancel_systemd_logs', {
                detail: { }
            });
            document.dispatchEvent(event);
        } else {
            setShellShow({show: true, unit_name: name,});
        }
    }
    const exec = () => {
    }
    const dswitch = (type) => {

    }
    // 删除系统上的sytemd
    const delete_systemd_sys = async (name)=> {
            setShowPrompt({open:true,handle:async ()=>{
                    const rsq = await sysHttp.post("systemd/sys/delete",{unit_name:name});
                    if (rsq.code === RCode.Sucess) {
                        NotySucess("删除成功");
                        setShowPrompt({open:false,handle:null});
                    }
                }
            })
    }
    // 从实时监控中删除
    const  del = async (name) =>{
        setShowPrompt({open:true,handle:async ()=>{
                const rsq = await sysHttp.post("systemd/delete",{unit_name:name});
                if (rsq.code === RCode.Sucess) {
                    NotySucess("删除成功");
                    setShowPrompt({open:false,handle:null});
                }
            }
        })
    }
    // 加载系统systemd单元
    const load_systemd = async ()=>{
        const data = await sysHttp.get("systemd/inside/all");
        if (data.code !== RCode.Sucess) {
            return;
        }
        set_inside_systemd(new Set(data.data));
        const rsq = await sysHttp.get("systemd/allget");
        if (rsq.code === RCode.Sucess) {
            const data :any[] = rsq.data;
            const list:any[][] = [];
            for (const value of data??[]) {
                const row = [<TextTip context={value.unit}/>,value.load,`${value.active}(${value.sub})`,<TextTip context={value.description}/>];
                row.push((<ActionButton icon={"place"} title={"添加"} onClick={() => {
                    set_systemd_opt_row(row);
                }}/>))
                list.push(row);
            }
            systemd_rows_p = list;
            set_systemd_rows(list);
        }
    }
    // 搜索系统单元
    const searchSystemd = ()=>{
        const left_rows = [];
        if (!systemd_filterkey) {
            set_systemd_rows(systemd_rows_p);
            return;
        }
        for (const list of systemd_rows_p) {
            if(list[0].props.context.includes(systemd_filterkey) || list[3].props.context.includes(systemd_filterkey)) {
                left_rows.push(list);
            }
        }
        set_systemd_rows(left_rows);
    }
    // 添加到管理
    const add_systemd = async (name)=>{
        const rsq = await sysHttp.post("systemd/add",{unit_name:name});
        if (rsq.code === RCode.Sucess) {
            set_inside_systemd(new Set(rsq.data));
            NotySucess("添加成功");
        }
    }
    // 获取sytemd文件内容
    const get_sytemd_context = async (name)=>{
        const rsq = await sysHttp.post("systemd/get/context",{unit_name:name});
        if (rsq.code === RCode.Sucess) {
            setEditorSetting({
                model:"text",
                open: true,
                fileName: props.name,
                save: async (context) => {
                    // const data = {
                    //     context,
                    //     path:rsq.data.path
                    // }
                    const data: saveTxtReq = {
                        context
                    }
                    if (rsq.data.path[0] === "/") {
                        rsq.data.path =  rsq.data.path.slice(1);
                    }
                    const rsq1 = await fileHttp.post(`save/${rsq.data.path}?is_sys_path=1`, data)
                    // const rsq1 = await fileHttp.post("common/save", data)
                    if (rsq1.code === RCode.Sucess) {
                        editor_data.set_value_temp('')
                        setEditorSetting({open: false, model: '', fileName: '', save: null})
                    }
                }
            })
            editor_data.set_value_temp(rsq.data.context)
        }
    }
    return <div>
        <Header left_children={<ButtonLittleStatus defaultStatus={false} text={t("系统systemd单元")} clickFun={(v)=>{
            setSystemd(v);
            if(v) {
                load_systemd();
                setOptRow([]);
            } else {
                set_systemd_opt_row([]);
            }
        }}/>}>

            {optRow.length > 0 && <div>
                {optRow[1].props.context}
            </div>}
            {systemd_opt_row.length > 0 && <div>
                {systemd_opt_row[0].props.context}
            </div>}
            {/*ystemd管理的选项*/}
            {optRow.length > 0 && <div>
                <ActionButton icon={"delete"} title={"从实时监控删除"} onClick={()=>{del(optRow[1].props.context)}}/>
                <ActionButton icon={"print"} title={"打印日志"} onClick={()=>{logs(optRow[1].props.context)}}/>
                {/*{optRow[1].props.context.includes("Up") ? (*/}
                {/*        <ActionButton icon={"stop"} title={"停止"} onClick={() => dswitch("stop")}/>) :*/}
                {/*    <ActionButton icon={"play_arrow"} title={"开启"} onClick={() => {dswitch("start")}}*/}
                {/*    />}*/}
            </div>}
            {/*系统的选项*/}
            {systemd_opt_row.length > 0 && <div>
                <ActionButton icon={"delete"} title={"删除系统上的sytemd"} onClick={()=>{delete_systemd_sys(systemd_opt_row[0].props.context)}}/>
                <ActionButton icon={"print"} title={"打印日志"} onClick={()=>{logs(systemd_opt_row[0].props.context)}}/>
                <ActionButton icon={"text_fields"} title={"sytemd文件内容"} onClick={()=>{get_sytemd_context(systemd_opt_row[0].props.context)}}/>
                {!inside_systemd.has(systemd_opt_row[0].props.context) && (<ActionButton icon={"plus_one"} title={"添加到管理"} onClick={() => add_systemd(systemd_opt_row[0].props.context)}/>)}
            </div>}
        </Header>
        <Dashboard>
            {systemd &&
                <Row>
                    <Column widthPer={80}>
                        <CardFull title={`systemd系统单元(${systemd_rows.length})`}
                                  titleCom={<InputText placeholder={"过滤单元"} value={systemd_filterkey}  handleInputChange={(value) => {
                                      set_systemd_filterkey(value);
                                  }} handlerEnter={searchSystemd}/>}>
                            <Table headers={systemd_headers} rows={systemd_rows} width={"10rem"}/>
                        </CardFull>
                    </Column>
                </Row>
            }
            {rows.length === 0 && !systemd && <Blank context={"没有管理的单元 or 加载中请等待..."}/>}
            {rows.length !== 0 && !systemd &&
                <Row>
                    <Column widthPer={80}>
                        <CardFull title={`filecat监控单元(${rows.length})`}
                                  titleCom={<InputText placeholder={"过滤单元"} value={filterKey}  handleInputChange={(value) => {
                                      setFilterKey(value)
                                  }}/>}>
                            <Table headers={headers} rows={rows} width={"10rem"}/>
                        </CardFull>
                    </Column>
                </Row>
            }
        </Dashboard>
        <SystemdShell/>
    </div>


}
