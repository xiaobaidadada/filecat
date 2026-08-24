import React, {useEffect, useState} from 'react'
import {Blank} from "../../../meta/component/Blank";
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard';
import {CardFull, TextTip} from "../../../meta/component/Card";
import {Table} from "../../../meta/component/Table";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {InputText} from "../../../meta/component/Input";
import {ActionButton, ButtonLittleStatus} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import { useAtom } from 'jotai';
import {$stroe} from "../../util/store";
import {useTranslation} from "react-i18next";
import {formatFileSize} from "../../../../common/ValueUtil";
import {sysHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySuccess} from "../../util/noty";
import {SystemdShell} from "../shell/SystemdShell";
import {SystemdEditor} from "./SystemdEditor";
import {editor_data, use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";

let filter = ""


let systemd_rows_p;
export function Systemd(props) {
    const { t } = useTranslation();
    const {check_user_auth} = use_auth_check();

    const [shellShow, setShellShow] = useAtom($stroe.systemd_shell_show);
    const [showPrompt, setShowPrompt] = useAtom($stroe.confirm);

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
    const [editorSetting, setEditorSetting] = useAtom($stroe.editorSetting)
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);


    const init = async () => {
        setRows([]);
        setOptRow([]);
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
            setRows(renders.map((row) => {
                const nextRow = row.map((cell, index2) => (
                    <TextTip context={index2 === 4 ? formatFileSize(cell) : cell}/>
                )); // 内存计算
                nextRow.push((<ActionButton icon={"place"} title={"选中"} onClick={() => {
                    setOptRow(nextRow);
                }}/>))
                return nextRow;
            }))
        })
    }
    useEffect(() => {
        setFilterKey(filter);
        init();
        // return () => {
        //     (async () => {
        //         if (ws.isAilive()) {
        //             ws.setPromise(async (resolve) => {
        //                 await ws.unConnect();
        //                 resolve();
        //             });
        //         }
        //     })();
        // }
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
                    if (rsq.code === RCode.Success) {
                        NotySuccess("删除成功");
                        setShowPrompt({open:false,handle:null});
                    }
                }
            })
    }
    // 从实时监控中删除
    const  del = async (name) =>{
        setShowPrompt({open:true,handle:async ()=>{
                const rsq = await sysHttp.post("systemd/delete",{unit_name:name});
                if (rsq.code === RCode.Success) {
                    NotySuccess("删除成功");
                    setShowPrompt({open:false,handle:null});
                }
            }
        })
    }
    // 加载系统systemd单元
    const load_systemd = async ()=>{
            set_systemd_rows([]);
            set_systemd_opt_row([]);
            const data = await sysHttp.get("systemd/inside/all");
            if (data.code !== RCode.Success) {
                return;
        }
        set_inside_systemd(new Set(data.data));
        const rsq = await sysHttp.get("systemd/allget");
            if (rsq.code === RCode.Success) {
                const data :any[] = rsq.data;
                const list:any[][] = [];
                for (const value of data??[]) {
                    const row = [<TextTip context={value.unit}/>,value.load,`${value.active}(${value.sub})`,<TextTip context={value.description}/>];
                    list.push([
                        ...row,
                        (<ActionButton icon={"place"} title={"添加"} onClick={() => {
                            set_systemd_opt_row([
                                ...row
                            ]);
                        }}/>)
                    ]);
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
    // 打开 systemd 可视化编辑面板（通过全局 set_prompt_card 弹框组件承载）
    const openEditor = (mode: 'create' | 'edit', unit_name?: string) => {
        set_prompt_card({
            open: true,
            title: mode === 'create' ? t('新建 systemd 服务') : t('编辑 systemd 服务'),
            context_div: <SystemdEditor
                mode={mode}
                unit_name={unit_name}
                onClose={() => set_prompt_card({open: false})}
                onDone={() => {
                    set_prompt_card({open: false});
                    // 保存成功后刷新：
                    // 1) 重新发一次 systemd_inside_get，让后端重建/维持实时监控订阅（handler 首屏已注册，这里不重复注册）；
                    // 2) 若停留在系统单元界面，同步刷新系统单元列表。
                    ws.send(new WsData(CmdType.systemd_inside_get));
                    if (systemd) {
                        load_systemd();
                    }
                    setOptRow([]);
                    set_systemd_opt_row([]);
                }}
            />,
        });
    }
    // 添加到管理
    const add_systemd = async (name)=>{
        const rsq = await sysHttp.post("systemd/add",{unit_name:name});
        if (rsq.code === RCode.Success) {
            set_inside_systemd(new Set(rsq.data));
            NotySuccess("添加成功");
        }
    }
    // 获取sytemd文件内容
    const get_sytemd_context = async (name)=>{
        const rsq = await sysHttp.post("systemd/get/context",{unit_name:name});
        if (rsq.code === RCode.Success) {
            setEditorSetting({
                model:"text",
                open: true,
                fileName: props.name,
                save: async (context) => {
                    // 直接把 systemd/get/context 接口已经返回的绝对路径 rsq.data.path 传给后端保存。
                    // 系统 systemd 文件位于 /etc/systemd/system/ 下，必须走专用的 systemd/sys/save 接口
                    // 用 FileUtil 按现有权限直接写；不能走通用文件 save/{path} 接口，那会把绝对路径
                    // 当成相对路径拼到 filecat 根目录下，导致写到一个不存在的目录而报 ENOENT。
                    const saveBody: any = {
                        unit_name: name,
                        path: rsq.data.path,
                        context
                    }
                    const rsq1 = await sysHttp.post("systemd/sys/save", saveBody)
                    if (rsq1.code === RCode.Success) {
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

            {/* 顶部菜单栏：新建 systemd 服务（可视化面板） */}
            {check_user_auth(UserAuth.systemd) && <div>
                <ActionButton icon={"add_circle"} title={t("添加 systemd")} onClick={()=>{
                    openEditor('create');
                }}/>
            </div>}

            {optRow.length > 0 && <div>
                {optRow[1].props.context}
            </div>}
            {systemd_opt_row.length > 0 && <div>
                {systemd_opt_row[0].props.context}
            </div>}
            {/*ystemd管理的选项*/}
            {optRow.length > 0 && <div>
                {check_user_auth(UserAuth.systemd)&& <ActionButton icon={"delete"} title={"从实时监控删除"} onClick={()=>{del(optRow[1].props.context)}}/>}
                {check_user_auth(UserAuth.systemd) && <ActionButton icon={"edit"} title={"可视化编辑"} onClick={()=>{
                    openEditor('edit', optRow[1].props.context);
                }}/>}
                <ActionButton icon={"print"} title={"打印日志"} onClick={()=>{logs(optRow[1].props.context)}}/>
                {/*{optRow[1].props.context.includes("Up") ? (*/}
                {/*        <ActionButton icon={"stop"} title={"停止"} onClick={() => dswitch("stop")}/>) :*/}
                {/*    <ActionButton icon={"play_arrow"} title={"开启"} onClick={() => {dswitch("start")}}*/}
                {/*    />}*/}
            </div>}
            {/*系统的选项*/}
            {systemd_opt_row.length > 0 && <div>
                {check_user_auth(UserAuth.systemd) && <ActionButton icon={"delete"} title={"删除系统上的sytemd"} onClick={()=>{delete_systemd_sys(systemd_opt_row[0].props.context)}}/>}

                <ActionButton icon={"print"} title={"打印日志"} onClick={()=>{logs(systemd_opt_row[0].props.context)}}/>
                {check_user_auth(UserAuth.systemd) && <ActionButton icon={"text_fields"} title={"sytemd文件内容"} onClick={()=>{get_sytemd_context(systemd_opt_row[0].props.context)}}/>}
                {(check_user_auth(UserAuth.systemd) && !inside_systemd.has(systemd_opt_row[0].props.context)) && (<ActionButton icon={"plus_one"} title={"添加到管理"} onClick={() => add_systemd(systemd_opt_row[0].props.context)}/>)}
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
