import React, {useEffect, useState} from 'react'
import {Blank} from "../../../meta/component/Blank";
import {Column, Dashboard, Row, RowColumn} from '../../../meta/component/Dashboard';
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import {Table} from "../../../meta/component/Table";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {staticSysPojo, SysPojo} from "../../../../common/req/sys.pojo";
import {InputCheckbox, InputRadio, InputText} from "../../../meta/component/Input";
import {ActionButton, Button, ButtonLittleStatus, ButtonText} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {DockerShell} from "../shell/DockerShell";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {PromptEnum} from "../prompts/Prompt";
import {useTranslation} from "react-i18next";
import {sysHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail, NotySucess, NotyWaring} from "../../util/noty";

let filter = ""

let images_rows_p = [];
let all_selected = false;

export function Docker(props) {
    const { t } = useTranslation();
    const [images_selected,set_images_selected] = useState({});
    const [rows, setRows] = useState([]);
    const [rows_images, set_rows_images] = useState([]);

    const [shellShow, setShellShow] = useRecoilState($stroe.dockerShellShow);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [filterKey,setFilterKey] = useState(filter);
    const [headers, setHeaders] = useState(["id", t("名字"), t("镜像"), t("命令"), t("状态"),t("内存"),"cpu%", t("选择")]);


    const [optRow, setOptRow] = useState([]);
    const [images_filterkey, set_images_filterkey] = useState(undefined);
    const [show_iamges,set_show_iamges] = useState(false);


    // 镜像选项函数
    const select = (name)=>{
        // state中必须要保存的是新的对象才会触发一些事件否则也是无用的，不能让set等于 images_selected
        const set = {};
        Object.assign(set, images_selected);
        if (set[name]) {
            delete set[name];
        } else {
            set[name] = 1;
        }
        set_images_selected(set);
    }
    // useState 内部的函数不能访问其它state
    const headers_images = ["id", t("name"), t("create时间"), t("大小"),
        <span>选中<ActionButton icon={"check_box"} title={"全选"} onClick={() => {
            all_selected = !all_selected;
            const set = {}
            for (let i = 0; i < rows_images.length; i++) {
                if (all_selected) {
                    set[rows_images[i][0].props.context] = 1;
                } else {
                    break;
                }
            }
            set_images_selected(set);
        }}/></span>];

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
    // 搜索镜像
    const search_image = ()=>{
        const left_rows = [];
        if (!images_filterkey) {
            set_rows_images(images_rows_p);
            return;
        }
        for (const list of rows_images) {
            if(list[0].props.context.includes(images_filterkey) || list[1].props.context.includes(images_filterkey)) {
                left_rows.push(list);
            }
        }
        set_rows_images(left_rows);
    }
    // 加载镜像
    const  load_images = async ()=> {
        const rsq = await sysHttp.get("docker/images");
        if (rsq.code === RCode.Sucess) {
            const data :any[] = rsq.data ??[];
            const list:any[][] = [];
            for (let i=0; i<data.length; i++) {
                const  value = data[i];
                const row = [<TextTip context={value[0]}/>,<TextTip context={value[1]}/>,value[2],value[3],""];
                list.push(row);
            }
            images_rows_p = list;
            set_rows_images(list);
        }
    }
    // 删除容器
    const delete_image = async ()=>{
        const keys = Object.keys(images_selected);
        const checkRsq = await sysHttp.post("docker/check/delete",{ids:keys});
        if (checkRsq.code === RCode.Sucess ) {
            if (checkRsq.data.length === 0) {
                const rsq = await sysHttp.post("docker/delete",{ids:keys});
                if (rsq.code === RCode.Sucess) {
                    NotySucess("删除完成");
                    load_images();
                }
            } else {
                NotyWaring(`有镜像正在运行${JSON.stringify(checkRsq.data)}`)
            }
        }

    }
    return <div>
        <Header left_children={<ButtonLittleStatus defaultStatus={false} text={t("docker镜像")} clickFun={(v) => {
            set_show_iamges(v);
            if (v) {
                ws.unConnect();
                load_images();
                setOptRow([]);
            } else {
                init();
                set_rows_images([]);
            }
        }}/>}>
            {Object.keys(images_selected).length >0  && <ActionButton icon={"delete"} title={"删除镜像"} onClick={delete_image}/>}
            {optRow.length > 0 && <div>
                {optRow[1].props.context}
            </div>}
            {optRow.length > 0 && <div>
                <ActionButton icon={"delete"} title={"删除容器"} onClick={del}/>
                <ActionButton icon={"print"} title={"打印日志"} onClick={logs}/>
                <ActionButton icon={"personal_video"} title={"执行命令"} onClick={exec}/>
                {optRow[4].props.context.includes("Up") ? (
                        <ActionButton icon={"stop"} title={"停止"} onClick={() => dswitch("stop")}/>) :
                    <ActionButton icon={"play_arrow"} title={"开启"} onClick={() => {
                        dswitch("start")
                    }}
                    />}
            </div>}

        </Header>
        <Dashboard>
            {show_iamges &&
                <Row>
                    <Column widthPer={80}>
                        <CardFull title={`镜像(${rows_images.length})`}
                                  titleCom={<InputText placeholder={"过滤镜像"} value={images_filterkey}
                                                       handleInputChange={(value) => {
                                                           set_images_filterkey(value);
                                                       }} handlerEnter={search_image}/>}>
                            <Table headers={headers_images} rows={rows_images.map((value, index) => {
                                value[4] =
                                    <InputCheckbox value={index} context={t("")} selected={images_selected[value[0].props.context]}
                                                   onchange={() => {
                                                       select(value[0].props.context)
                                                   }}/>; // 只有这样才会生效，如果在前面的http请求函数后是不会生效的，因为任何state修改过后，整个组件的所有元素都会被重新渲染，而在前面函数中填充的组件不在这个显示的组件(指的是这个组件返回的jfx html组件代码)运行内，就不会再次渲染了
                                return value;
                            })} width={"10rem"}/>
                        </CardFull>
                    </Column>
                </Row>
            }
            {rows.length === 0 && !filterKey && !show_iamges && <Blank context={"检测不到docker，主机可能没有安装docker or 容器为空"}/>}
            {(rows.length !== 0 || filterKey) && !show_iamges && (
                <Row>
                    <Column widthPer={80}>
                        <CardFull title={`容器(${rows.length})`}
                                  titleCom={<InputText placeholder={"过滤"} value={filterKey}
                                                       handleInputChange={(value) => {
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
