import React, {useContext, useEffect, useMemo, useRef, useState} from 'react'
import {Column, Dashboard, Row, TextLine} from "../../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle, TextTip} from "../../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../../meta/component/Button";
import {Rows, Table} from "../../../../meta/component/Table";
import {InputCheckbox, InputRow, InputText, Select} from "../../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {cryptoHttp, settingHttp, tcpProxy, userHttp} from "../../../util/config";
import {RCode} from "../../../../../common/Result.pojo";
import {SysSoftware, TokenSettingReq} from "../../../../../common/req/setting.req";
import {GlobalContext} from "../../../GlobalProvider";
import { useAtom } from 'jotai';
import {$stroe} from "../../../util/store";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {UserAuth, UserData} from "../../../../../common/req/user.req";
import {deleteList} from "../../../../../common/ListUtil";
import {have_empty_char} from "../../../../../common/StringUtil";
import {
    fault_ignore_text,
    server_client_proxy, tcp_proxy_bridge_fig_item,
    tcp_proxy_client_item,
    tcp_proxy_server_client,
    tcp_proxy_server_config, tcp_proxy_sync_target, tcp_proxy_sync_task_item
} from "../../../../../common/req/common.pojo";
import {ws} from "../../../util/ws";
import {CmdType} from "../../../../../common/frame/WsData";
import {editor_data} from "../../../util/store.util";


export function TcpProxyServerClientSetting() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [user_base_info,setUser_base_info] = useAtom($stroe.user_base_info);
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);
    const [, set_confirm] = useAtom($stroe.confirm);
    const [editorSetting, setEditorSetting] = useAtom($stroe.editorSetting)

    const [sync_task_list,set_sync_task_list] = useState<tcp_proxy_sync_task_item[]>([])
    const [all_client_options,set_all_client_options] = useState<{title:string,value:string}[]>([])

    // 左侧列表只展示这几个字段
    const list_headers = [t("编号"), t("原客户端"), t("开启"), t("备注"), t("操作")];

    // 右侧详情：当前编辑的任务（未保存的草稿也放这里）
    const [edit_task,set_edit_task] = useState<(tcp_proxy_sync_task_item & {is_new?:boolean}) | null>(null)

    const get_all_client = async ()=>{
        const r2 = await tcpProxy.get("server_client_get")
        if(r2.code === RCode.Success) {
            const list:tcp_proxy_server_client[] = r2.data
            const options = []
            for (const item of list) {
                options.push({
                    title: item.client_name,
                    value: item.client_num_id,
                })
            }
            set_all_client_options(options)
            await load_sync_tasks()
        }
    }

    useEffect(() => {
        get_all_client()
    }, []);

    const load_sync_tasks = async () => {
        const r = await tcpProxy.get("sync_task_get")
        if (r.code === RCode.Success) {
            set_sync_task_list(r.data as any);
        }
    }

    const client_name = (value: string | number) => {
        return all_client_options.find((item) => String(item.value) === String(value))?.title ?? "";
    }

    /** 打开右侧详情：编辑已有任务 */
    const edit = (item: tcp_proxy_sync_task_item) => {
        set_edit_task(JSON.parse(JSON.stringify(item)));
    }

    /** 打开右侧详情：新建任务 */
    const create_task = () => {
        set_edit_task({
            open: false,
            source_client_num_id: undefined as any,
            source_dir: "",
            targets: [{client_num_id: undefined as any, dir: "", full_sync: false}],
            delete_missing: true,
            is_new: true,
        } as any)
    }

    const close_edit = () => set_edit_task(null)

    const set_target_field = (index: number, key: keyof tcp_proxy_sync_target, value: any) => {
        if (!edit_task?.targets) return;
        edit_task.targets[index] = {...edit_task.targets[index], [key]: value};
        set_edit_task({...edit_task, targets: [...edit_task.targets]});
    }

    const add_target = () => {
        if (!edit_task) return;
        const targets = [...(edit_task.targets ?? []), {client_num_id: undefined as any, dir: "", full_sync: false}];
        set_edit_task({...edit_task, targets});
    }

    const del_target = (index: number) => {
        if (!edit_task?.targets) return;
        const targets = [...edit_task.targets];
        targets.splice(index, 1);
        set_edit_task({...edit_task, targets});
    }

    const save_sync_task = async () => {
        if (!edit_task) return;
        const payload: tcp_proxy_sync_task_item = edit_task;
        const r = await tcpProxy.post("sync_task_save", payload)
        if (r.code === RCode.Success) {
            NotySuccess(t("成功"))
            set_edit_task(null)
            await load_sync_tasks()
        } else {
            NotyFail(r.message ?? t("操作失败"))
        }
    }

    const del_sync_task = async (id: string) => {
        const r = await tcpProxy.post("sync_task_del", {id})
        if (r.code === RCode.Success) {
            NotySuccess(t("成功"))
            if (edit_task?.id === id) {
                set_edit_task(null)
            }
            await load_sync_tasks()
        }
    }

    /** 立即同步：让任务源端忽略增量缓存，把本地目录全量重推一遍 */
    const rescan_sync_task = async (item: tcp_proxy_sync_task_item) => {
        if (!item.id || !item.open) {
            NotyFail(t("tsk_off"))
            return
        }
        const r = await tcpProxy.post("sync_task_rescan", {id: item.id})
        if (r.code === RCode.Success) {
            NotySuccess(t("已触发同步"))
        } else {
            NotyFail(r.message ?? t("操作失败"))
        }
    }

    const open_ignore_editor = (task: tcp_proxy_sync_task_item) => {
        editor_data.set_value_temp(task.ignore_text ?? fault_ignore_text)
        setEditorSetting({
            model: "ace/mode/gitignore",
            open: true,
            fileName: "",
            save: async (context) => {
                task.ignore_text = context
                set_edit_task({...task})
                editor_data.set_value_temp('')
                await save_sync_task_of(task)
            }
        })
    }

    /** 忽略规则编辑器的保存：直接落库，不改动其他状态 */
    const save_sync_task_of = async (task: tcp_proxy_sync_task_item) => {
        const r = await tcpProxy.post("sync_task_save", task)
        if (r.code === RCode.Success) {
            NotySuccess(t("成功"))
            await load_sync_tasks()
        } else {
            NotyFail(r.message ?? t("操作失败"))
        }
    }

    return (<Row>
        <Column widthPer={50} maxWidth={"40rem"}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}>
                    <h2>{t(`客户端文件同步`)}</h2>
                    <ActionButton icon={"info"} onClick={()=>{
                        set_prompt_card({open:true,title:"信息",context_div : (
                                <div>
                                   <ul>
                                       <li>
                                           {t(`sy_tp1`)}
                                       </li>
                                       <li>
                                           {t(`sy_tp2`)}
                                       </li>
                                       <li>
                                           {t(`sy_tp3`)}
                                       </li>
                                   </ul>
                                </div>
                            )})
                    }} title={t("信息")}/>
                </span>}
                          titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={create_task}/></div>}>
                    <Table headers={list_headers} rows={sync_task_list.map((item, index) => {
                        return [
                            <p>{item.id?.slice(0, 8) ?? index}</p>,
                            <TextTip>{item.source_client_name}</TextTip>,
                            <>{<StatusCircle ok={!!item.open}/>}{item.open ? t("开启") : t("关闭")}</>,
                            <TextTip>{item.note}</TextTip>,
                            <div>
                                <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                                <ActionButton icon={"sync"} title={t("立即同步")} onClick={() => rescan_sync_task(item)}/>
                                <ActionButton icon={"delete"} title={t("删除")} onClick={() => {
                                    set_confirm({
                                        open: true,
                                        title: t('确定删除吗'),
                                        handle: async () => {
                                            await del_sync_task(item.id!)
                                            set_confirm({open:false,handle:null});
                                        }
                                    })
                                }}/>
                            </div>
                        ]
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>
        </Column>
        <Column widthPer={50}>
            {edit_task &&
                <Dashboard>
                    <Card self_title={<span className={" div-row "}><h2>{t(`${edit_task.is_new ? "添加" : "编辑"}`)}</h2></span>}
                          rightBottomCom={<div>
                              <ActionButton icon={"cancel"} title={t("取消")} onClick={close_edit}/>
                              <ActionButton icon={"save"} title={t("保存")} onClick={save_sync_task}/>
                          </div>}>
                        <InputRow label={t("开启")} label_width={"6rem"}>
                            <InputCheckbox selected={!!edit_task.open} onchange={()=>{
                                set_edit_task({...edit_task, open: !edit_task.open})
                            }}/>
                        </InputRow>
                        <InputRow label={t("备注")} label_width={"6rem"}>
                            <InputText value={edit_task.note} handleInputChange={(value) => {
                                set_edit_task({...edit_task, note: value})
                            }}/>
                        </InputRow>
                        <InputRow label={t("原客户端")} label_width={"6rem"} required>
                            <Select value={edit_task.source_client_num_id} options={all_client_options}
                                    onChange={(value) => {
                                        const id = parseInt(String(value));
                                        set_edit_task({...edit_task, source_client_num_id: id})
                                    }}/>
                        </InputRow>
                        <InputRow label={t("原目录")} label_width={"6rem"} required>
                            <InputText value={edit_task.source_dir} placeholder={t("被同步的源目录")}
                                       handleInputChange={(value) => {
                                           set_edit_task({...edit_task, source_dir: value})
                                       }}/>
                        </InputRow>

                        <label>{t("目标列表")}</label>
                        {(edit_task.targets ?? []).map((target, index) => {
                            return <div key={index} className={"div-row"}>
                                <div style={{width: "10rem"}}>
                                    <Select value={target.client_num_id} options={all_client_options}
                                            onChange={(value) => set_target_field(index, "client_num_id", parseInt(String(value)))}/>
                                </div>
                                <div style={{flex: 1}}>
                                    <InputText value={target.dir} placeholder={t("目标目录")}
                                               handleInputChange={(value) => set_target_field(index, "dir", value)}/>
                                </div>
                                <div className={"div-row"}>
                                    <span>{t("全量同步")}</span>
                                    <InputCheckbox selected={!!target.full_sync}
                                                   onchange={() => set_target_field(index, "full_sync", !target.full_sync)}/>
                                </div>
                                <ActionButton icon={"delete"} title={t("删除")} onClick={() => del_target(index)}/>
                            </div>
                        })}
                        <div className={"div-row"}>
                            <ActionButton icon={"add"} title={t("添加")} onClick={add_target}/>
                            <ActionButton icon={"edit"} title={t("忽略目录")} onClick={() => {
                                open_ignore_editor(edit_task)
                            }}/>
                        </div>
                    </Card>
                </Dashboard>
            }
        </Column>
    </Row>)
}
