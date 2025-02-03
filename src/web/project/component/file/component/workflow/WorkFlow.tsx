import {useTranslation} from "react-i18next";
import React, {useEffect, useState} from "react";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../../util/store";
import {CmdType, WsData} from "../../../../../../common/frame/WsData";
import {ws} from "../../../../util/ws";
import {DiskCheckInfo, DiskDevicePojo, DiskFilePojo, staticSysPojo, SysPojo} from "../../../../../../common/req/sys.pojo";
import {sysHttp} from "../../../../util/config";
import {RCode} from "../../../../../../common/Result.pojo";
import {SysSoftware} from "../../../../../../common/req/setting.req";
import {Card, CardFull, StatusCircle, TextTip} from "../../../../../meta/component/Card";
import {ActionButton, ButtonLittle, ButtonLittleStatus} from "../../../../../meta/component/Button";
import {NotyFail} from "../../../../util/noty";
import Header from "../../../../../meta/component/Header";
import {Column, Dashboard, FullScreenContext, Row, TextLine} from "../../../../../meta/component/Dashboard";
import CircleChart from "../../../../../meta/component/CircleChart";
import {Table} from "../../../../../meta/component/Table";
import {FullScreenDiv} from "../../../../../meta/component/Dashboard";
import {InputText} from "../../../../../meta/component/Input";
import {job_item, step_item, WorkflowGetReq, WorkflowGetRsq} from "../../../../../../common/req/file.req";
import {getRouterAfter, getRouterPath} from "../../../../util/WebPath";
import TreeView from "../../../../../meta/component/TreeView";
import {tree_list} from "../../../../../../common/req/common.pojo";
import {Shell} from "../../../shell/Shell";
import {Terminal} from "@xterm/xterm";

let terminal_init_resolve;
let terminal_value;
let input_page_num = -1;

export function WorkFlow(props) {
    const {t} = useTranslation();
    const [workflow_show,set_workflow_show] = useRecoilState($stroe.workflow_show);
    const [task_rows,set_task_rows] = useState([]);
    const [job_list,set_job_list] = useState([])
    const [shellShow,setShellShow] = useState(false);
    const [terminalState,setTerminalState] = useState(undefined)
    const [step_tree_list, set_step_tree_list] = useState([] as tree_list);
    const [page_num,set_page_num] = useState(-1);
    const [page_size,set_page_size] = useState(10);
    const [total,set_total] = useState(0);
    const [max_page_num,set_max_page_num] = useState(0);
    const [search_name,set_search_name] = useState("")
    const [search_name_status,set_search_name_status] = useState(false)

    const task_headers = [t("序号"),t("运行名称"), t("状态"), t("运行时长"),t("日期"), t("操作"),];
    const job_headers = [t("名称"), t("状态"),t("cwd"),t("运行时长"), t("操作")];



    const get_page = async (page_num_value?:number) => {
        const req = new WorkflowGetReq();
        req.page_num = page_num_value??page_num;
        req.page_size = page_size;
        req.dir_path = `${getRouterAfter('file', getRouterPath())}`
        const data:WsData<WorkflowGetRsq> = await ws.sendData(CmdType.workflow_get,req);
        if(!data)return;
        const pojo = data.context as WorkflowGetRsq;
        // console.log(pojo.list.map(value => {
        //     // @ts-ignore
        //     return JSON.parse(value.meta)}))
        set_task_rows(pojo.list.map(value => {
            // @ts-ignore
            const v = typeof value.meta === "string"?JSON.parse(value.meta):value.meta;
            v.index = value.index;
            return v}))
        set_total(pojo.total);
        set_max_page_num(parseInt((pojo.total / page_size).toFixed(0)))
    }

    const search_run_name = async (search_name)=>{
        const req = new WorkflowGetReq();
        req.search_name = search_name;
        req.dir_path = `${getRouterAfter('file', getRouterPath())}`
        set_search_name_status(true);
        const data:WsData<WorkflowGetRsq> = await ws.sendData(CmdType.workflow_search_by_run_name,req);
        if(!data)return;
        const pojo = data.context as WorkflowGetRsq;
        // console.log(pojo.list)
        set_task_rows(pojo.list.map(value => {
            // @ts-ignore
            const v = typeof value.meta === "string"?JSON.parse(value.meta):value.meta;
            v.index = value.index;
            return v}))
        set_total(pojo.total);
        set_max_page_num(parseInt((pojo.total / page_size).toFixed(0)))
        set_page_num(0)
        set_search_name_status(false);
    }

    const initTerminal =  async () => {
        const terminal = new Terminal({
            // fontSize: 15,
            // fontWeight: 900,
            fontFamily: "Monaco, Menlo, Consolas, 'Courier New', monospace",
            theme: {
                background: '#FFFFFF',
                foreground: '#000000',
                cursor:'#000000',
                selectionBackground:"#a6d2ff"
            },
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 1000,
            scrollSensitivity: 1,
            tabStopWidth: 4,
            convertEol:true // \n换行符
        });
        terminal_value = terminal;
        setTerminalState(terminal)
    }
    useEffect(() => {
        setShellShow(false)
        terminal_init_resolve = undefined;
        terminal_value = undefined;
        input_page_num =-1;
        get_page();
        return async () => {
            if (terminal_value) {
                // shell 组件不自己注销了 这里自己注销
                terminal_value.dispose();
                terminal_value = null;
            }
            // await ws.unConnect(); // 让文件管理断掉这里不断了
        }
    }, [])
    const task_click = async (item)=>{
        if(item.is_running) {
            return;
        }
        set_step_tree_list([])
        const req = new WorkflowGetReq();
        req.index = item.index;
        req.dir_path = `${getRouterAfter('file', getRouterPath())}`
        const data:WsData<WorkflowGetRsq> = await ws.sendData(CmdType.workflow_get,req);
        const pojo = data.context as WorkflowGetRsq;
        // @ts-ignore
        const v = typeof pojo.one_data.data === "string"?JSON.parse(pojo.one_data.data):pojo.one_data.data;
        const successList:job_item[] = v.success_list;
        const fail_list:job_item[] = v.fail_list;
        set_job_list([...fail_list,...successList])
        // console.log([...fail_list,...successList])
    }
    const get_children_list = (r_list:tree_list,list?:step_item[],job_list?:job_item[])=>{
        if(list){
            for (const item of list??[]){
                let name;
                const children:tree_list = [];
                if(item['use-yml']) {
                    get_children_list(children,undefined,item.use_job_children_list)
                    name = `${item['use-yml']}  ;${item.duration??-1}`
                } else {
                    name = `${item.run}  ;${item.duration??-1}`
                }
                name = <div><StatusCircle success={item.code === undefined?undefined:item.code === 0} />${name}</div>
                r_list.push({
                    name:name,
                    children,
                    extra_data: {
                        code:item.code,
                        context:item.success_message ?? item.fail_message
                    }
                })
            }
        } else if(job_list) {
            for (const item of job_list??[]){
                r_list.push({
                    name:item.name,
                    extra_data: {code:item.code,is_job:true,job_data:item}
                })
            }
        }

    }
    const job_click = async (item)=>{
        const steps:step_item[] = item.steps;
        const list:tree_list = [];
        get_children_list(list,steps??[])
        set_step_tree_list(list)
    }
    const terminal_init = ()=>{
        if(terminal_init_resolve) {
            terminal_init_resolve(1)
            terminal_init_resolve = undefined;
        }
    }
    const print =async (message)=>{
        // 判断终端展示是否初始化
        if(!terminalState) {
            await new Promise(resolve => {
                terminal_init_resolve = resolve;
                setShellShow(true)
                initTerminal();
            });
        }
        if(message) {
            terminal_value.clear()
            terminal_value.write(message);
        }

    }
    const step_click = async (item)=>{
        if(item?.extra_data?.is_job) {
            // 是否是嵌套的其它文件中的job
            // console.log(item.extra_data.job_data)
            await job_click(item.extra_data.job_data)
            return;
        }

        // 加载step的展示数据
        if(item?.extra_data?.context) {
            // setShellShow(true)
            print(item.extra_data.context)
        } else {
            if(!item?.extra_data.code)  {
                return; // 空日志没有必要显示了
            }
            // setShellShow(true)
            print(item.extra_data.code??"")
        }
    }

    return <div>
        <Header>
            {terminalState && <ActionButton icon={"print"} title={"打印日志"} onClick={()=>{
                setShellShow(!shellShow);
            }}/>}
            <ActionButton icon={"close"} title={t("关闭")} onClick={() => {
                set_workflow_show(false);
            }}/>
        </Header>
        <FullScreenDiv isFull={true} more={true}>
            <FullScreenContext>
                <Dashboard>
                <Row >
                    <Column >

                            <CardFull self_title={<span className={" div-row "}><h2>{t("历史记录")}</h2>
                                {/*<ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/>*/}
                </span>}
                                      titleCom={<div className={" div-row "}>
                                          <InputText
                                              disabled={search_name_status}
                                              value={search_name}
                                              placeholder={"搜索运行名称(支持正则)"} handleInputChange={(v)=>{
                                              set_search_name(search_name)
                                          }}
                                              handlerEnter={(v)=>{search_run_name(v)}}
                                          />
                                          <ActionButton icon={"refresh"} title={t("刷新")} onClick={()=>{}}/>
                            </div>}
                            rightBottomCom={<span className={" div-row "}>
                                <span>total {total} ;</span>
                                <span>now {Math.abs(page_num)} </span>
                                <InputText placeholder={`max page ${max_page_num}`} handleInputChange={(v) => {
                                    input_page_num = parseInt(v);
                                }}
                                           handlerEnter={() => {
                                               if (input_page_num < 1 || input_page_num > max_page_num) {
                                                   NotyFail("illegal page num")
                                                   return;
                                               }
                                               get_page(0 - input_page_num)
                                           }}
                                />
                                <ActionButton icon={"navigate_before"} onClick={() => {
                                    const n = page_num + 1;
                                    if (n > -1) {
                                        NotyFail("max page num")
                                        return;
                                    }
                                    set_page_num(n)
                                    get_page(n)
                                }} title={"上一页"}/>
                                <ActionButton icon={"navigate_next"} onClick={() => {
                                    const n = page_num - 1;
                                    if (Math.abs(n) > max_page_num) {
                                        NotyFail("min page num")
                                        return
                                    }
                                    set_page_num(n)
                                    get_page(n)
                                }} title={"下一页"}/>
                </span>}>
                            <Table headers={task_headers} rows={task_rows.map((item, index) => {
                                    let div;
                                    if(item.is_running) {
                                        div = <div><StatusCircle />{t('正在运行')}</div>
                                    } else {
                                        div = <div><StatusCircle
                                            success={item['is_success']}/>{item.is_success ? t("成功") : t('失败')}
                                        </div>
                                    }
                                    const new_list = [
                                        <p>{item.index}</p>,
                                        <p style={{
                                            wordWrap: 'break-word',
                                        }}>{item['run-name']}</p>,
                                        div,
                                        <span>{item.duration}</span>,
                                        <span>{item.timestamp}</span>,
                                        <div>
                                            <ActionButton icon={"details"} title={t("详情")} onClick={() => {task_click(item)}}/>
                                        </div>,
                                    ];
                                    return new_list;
                                })} width={"10rem"}/>
                            </CardFull>
                    </Column>
                    <Column >
                        <Card title={t("Job")}>
                            <Table headers={job_headers} rows={job_list.map((item, index) => {
                                const new_list = [
                                    <p>{item.name}</p>,
                                    <div><StatusCircle success={item.code === undefined?undefined:item.code === 0} />{item.code ===0?t("成功"):t('失败')}</div>,
                                    <TextTip>{item.cwd}</TextTip>,
                                    <span>{item.duration}</span>,
                                    <div>
                                        <ActionButton icon={"details"} title={t("详情")} onClick={() => {job_click(item)}}/>
                                        {(!!item.success_message || !!item.fail_message) && <ActionButton icon={"print"} title={t("日志")} onClick={() => {
                                            print(item.success_message??item.fail_message)
                                        }}/>}
                                    </div>,
                                ];
                                return new_list;
                            })} width={"10rem"}/>
                        </Card>

                        <Card title={"Step"}>
                            <TreeView list={step_tree_list} click={(item) => {
                                step_click(item);
                            }}/>
                        </Card>

                    </Column>
                </Row>
                </Dashboard>
            </FullScreenContext>
        </FullScreenDiv>
        <div style={{
            display: shellShow?"":"none",
        }}>
            <Shell show={true} terminal={terminalState} init={terminal_init}/>
        </div>
    </div>
}