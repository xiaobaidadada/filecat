import {useTranslation} from "react-i18next";
import React, {useEffect, useState} from "react";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../../util/store";
import {CmdType} from "../../../../../../common/frame/WsData";
import {ws} from "../../../../util/ws";
import {StatusCircle} from "../../../../../meta/component/Card";
import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {FullScreenContext, FullScreenDiv} from "../../../../../meta/component/Dashboard";
import {job_item, running_type, step_item, WorkFlowRealTimeOneReq} from "../../../../../../common/req/file.req";
import {getRouterAfter, getRouterPath} from "../../../../util/WebPath";
import TreeView from "../../../../../meta/component/TreeView";
import {tree_list, workflow_realtime_tree_list} from "../../../../../../common/req/common.pojo";
import {Shell} from "../../../shell/Shell";
import {Terminal} from "@xterm/xterm";
import {NotyFail, NotySucess} from "../../../../util/noty";

let terminal_init_resolve;
let terminal_value;
let input_page_num = -1;

export function WorkFlowRealTime(props) {
    const {t} = useTranslation();
    const [workflow_show,set_workflow_show] = useRecoilState($stroe.workflow_realtime_show);
    const [task_rows,set_task_rows] = useState([]);
    const [job_list,set_job_list] = useState([])
    const [shellShow,setShellShow] = useState(false);
    const [terminalState,setTerminalState] = useState(undefined)
    const [step_tree_list, set_step_tree_list] = useState([] as workflow_realtime_tree_list);

    const render_list = (list:workflow_realtime_tree_list)=>{
        for(const item of list){
            if(item?.extra_data?.running_type === running_type.success){
                item.name = <div><StatusCircle success={true} />{item.name}</div>
            } else if(item?.extra_data?.running_type === running_type.fail) {
                item.name = <div><StatusCircle success={false} />{item.name}</div>
            } else if(item?.extra_data?.running_type === running_type.running) {
                item.name = <div><StatusCircle running={true} />{item.name}</div>
            }
            if(item.children) {
                render_list(item.children);
            }
        }
    }
    const get_data = async (page_num_value?:number) => {
        const req = new WorkFlowRealTimeOneReq();

        req.filename_path = `${getRouterAfter('file', getRouterPath())}${workflow_show.filename}`
        ws.addMsg(CmdType.workflow_realtime_one_rsq,(data)=>{
            // console.log(data.context)
            // if(data.context.done === true) {
            //     NotySucess("done!");
            // } else if(data.context.done === false) {
            //     NotyFail("done!");
            // }
            if(data.context.list && data.context.list.length > 0) {
                const list = data.context.list as workflow_realtime_tree_list;
                render_list(list)
                set_step_tree_list(list);
            }
            if(data.context.new_log) {
                print(data.context.new_log);
            }
        })
        ws.sendData(CmdType.workflow_realtime_one_req,req);

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
        get_data();
        return async () => {
            ws.removeMsg(CmdType.workflow_realtime_one_rsq) // 忽略
            if (terminal_value) {
                // shell 组件不自己注销了 这里自己注销
                terminal_value.dispose();
                terminal_value = null;
            }
            // await ws.unConnect(); // 让文件管理断掉这里不断了
        }
    }, [])

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
        if(!terminal_value) {
            await new Promise(resolve => {
                terminal_init_resolve = resolve;
                setShellShow(true)
                initTerminal();
            });
        }
        if(message) {
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
                set_workflow_show({open:false});
            }}/>
        </Header>
        <FullScreenDiv isFull={true} more={true}>
            <FullScreenContext>
                <TreeView list={step_tree_list} click={(item) => {
                    // step_click(item);
                }}/>
            </FullScreenContext>
        </FullScreenDiv>
        <div style={{
            display: shellShow?"":"none",
        }}>
            <Shell show={true} terminal={terminalState} init={terminal_init}/>
        </div>
    </div>
}