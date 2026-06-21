import React, {useContext, useEffect, useMemo, useRef, useState} from 'react'
import {Column, Dashboard, Row, TextLine} from "../../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle, TextTip} from "../../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../../meta/component/Button";
import {Rows, Table} from "../../../../meta/component/Table";
import {InputCheckbox, InputRadio, InputText, Select} from "../../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {cryptoHttp, settingHttp, tcpProxy, userHttp} from "../../../util/config";
import {RCode} from "../../../../../common/Result.pojo";
import {SysSoftware, TokenSettingReq} from "../../../../../common/req/setting.req";
import {GlobalContext} from "../../../GlobalProvider";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../../util/store";
import {NotyFail, NotySucess} from "../../../util/noty";
import {UserAuth, UserData} from "../../../../../common/req/user.req";
import {deleteList} from "../../../../../common/ListUtil";
import {have_empty_char} from "../../../../../common/StringUtil";
import {
    fault_ignore_text,
    server_client_proxy, tcp_proxy_bridge_fig_item,
    tcp_proxy_client_item,
    tcp_proxy_server_client,
    tcp_proxy_server_config, tcp_proxy_sync_task_item
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

    const [sync_task_list,set_sync_task_list] = useState<(tcp_proxy_sync_task_item & {ignore_text?: string})[]>([])

    const sync_task_headers = [t("编号"), t("原客户端"), t("原目录"), t("目标客户端"), t("目标目录"), t("忽略目录"), t("开启"),t("双向同步"),t("全量同步"), t("备注")];

    const [all_client_options,set_all_client_options] = useState<{label:string,value:string}[]>([])


    const get_all_client = async ()=>{
        const r2 = await tcpProxy.get("server_client_get")
        if(r2.code === RCode.Success) {
            const list:tcp_proxy_server_client[] = r2.data
            const options = []
            for (const item of list) {
                options.push({
                    label: item.client_name,
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

    const resolveClientOption = (value: string | number) => {
        return all_client_options.find((item) => String(item.value) === String(value));
    }

    const save_sync_task = async (item: tcp_proxy_sync_task_item ) => {
        const payload: tcp_proxy_sync_task_item = item;
        const r = await tcpProxy.post("sync_task_save", payload)
        if (r.code === RCode.Success) {
            NotySucess("成功")
            await load_sync_tasks()
        }
    }

    const del_sync_task = async (id: string) => {
        const r = await tcpProxy.post("sync_task_del", {id})
        if (r.code === RCode.Success) {
            NotySucess("成功")
            await load_sync_tasks()
        }
    }

    return (<Row>
        <Column widthPer={100}>
            <Dashboard>
                <Card self_title={<span className={" div-row "}>
                    <h2>{t(`客户端文件同步`)}</h2>
                    <ActionButton icon={"info"} onClick={()=>{
                        set_prompt_card({open:true,title:"信息",context_div : (
                                <div>
                                    <li>
                                        {t(`默认（没有选中全量同步）不会立即同步两个目录中的文件，而是有文件被修改或者改动后才会同步，如果开启全量同步，每次客户端一上线就会递归的同步全部的文件，如果文件非常多，这会造成很大的执行压力。`)}
                                    </li>
                                    <li>
                                        {t(`如果开启了双向同步，如果两边初始化的时候各自又有很多文件，这是不太稳定的,暂时不建议这样做。`)}
                                    </li>
                                    <li>
                                        {t(`同时开启全量同步和双向同步，目前性能也会很差，目前没有提供提供冲突冲突的机制。`)}
                                    </li>
                                    <li>
                                        {t(`如果想用全量同步，一方的文件是空的，且文件数量比较少，几百这样的数量，效果是不错的，之后会一直走增量更新。`)}
                                    </li>
                                </div>
                            )})
                    }} title={"信息"}/>
                </span>}>
                    <ActionButton icon={"add"} onClick={() => {
                        const defaultSource = all_client_options?.[0]?.value;
                        const defaultTarget = all_client_options?.[1]?.value ?? all_client_options?.[0]?.value;
                        sync_task_list.push({
                            open: false,
                            // source_client_num_id: defaultSource ? parseInt(String(defaultSource)) : undefined,
                            // target_client_num_id: defaultTarget ? parseInt(String(defaultTarget)) : undefined,
                            source_dir: "",
                            target_dir: "",
                            // ignore_text: "",
                            delete_missing: true,
                        } as any)
                        set_sync_task_list([...sync_task_list])
                    }} title={t("添加")}/>
                    <Table headers={sync_task_headers} rows={sync_task_list.map((item, index) => {
                        const sourceOpt = resolveClientOption(item.source_client_num_id);
                        const targetOpt = resolveClientOption(item.target_client_num_id);
                        return [
                            <p>{index}</p>,
                            <InputText value={sourceOpt?.label ?? item.source_client_name} options={all_client_options} handleInputChange={(value) => {
                                const selected = resolveClientOption(value);
                                item.source_client_num_id = parseInt(String(selected?.value));
                                item.source_client_name = selected?.label;
                                set_sync_task_list([...sync_task_list])
                            }} no_border={true}/>,
                            <InputText value={item.source_dir} handleInputChange={(value) => {
                                item.source_dir = value;
                            }} no_border={true}/>,
                            <InputText value={targetOpt?.label ?? item.target_client_name} options={all_client_options} handleInputChange={(value) => {
                                const selected = resolveClientOption(value);
                                item.target_client_num_id = parseInt(String(selected?.value));
                                item.target_client_name = selected?.label;
                                set_sync_task_list([...sync_task_list])
                            }} no_border={true}/>,
                            <InputText value={item.target_dir} handleInputChange={(value) => {
                                item.target_dir = value;
                            }} no_border={true}/>,
                            <ActionButton icon={"edit"} title={"额外参数设置"} onClick={() => {
                                editor_data.set_value_temp(item.ignore_text??fault_ignore_text)
                                setEditorSetting({
                                    model: "ace/mode/gitignore",
                                    open: true,
                                    fileName: "",
                                    save:async (context)=>{
                                        item.ignore_text = context
                                        set_sync_task_list([...sync_task_list])
                                        editor_data.set_value_temp('')
                                        save_sync_task(item)
                                    }
                                })
                            }}/>,
                            <InputCheckbox selected={!!item.open} onchange={()=>{
                                item.open = !item.open
                                set_sync_task_list([...sync_task_list])
                            }} />,
                           <InputCheckbox selected={!!item.two_way_sync} onchange={()=>{
                                item.two_way_sync = !item.two_way_sync
                                set_sync_task_list([...sync_task_list])
                            }} />,
                            <InputCheckbox selected={!!item.full_sync} onchange={()=>{
                                item.full_sync = !item.full_sync
                                set_sync_task_list([...sync_task_list])
                            }} />,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <div>
                                <ActionButton icon={"save"} title={t("保存")} onClick={() => {
                                    save_sync_task(item)
                                }}/>
                                <ActionButton icon={"delete"} title={t("删除")} onClick={() => {
                                    if (item.id) {
                                        set_confirm({
                                            open: true,
                                            title: t('确定删除吗'),
                                            // sub_title: ``,
                                            handle: async () => {
                                                await del_sync_task(item.id)
                                                NotySucess("删除完成");
                                                set_confirm({open:false,handle:null});
                                            }
                                        })
                                    } else {
                                        sync_task_list.splice(index, 1);
                                        set_sync_task_list([...sync_task_list])
                                    }
                                }}/>
                            </div>
                        ]
                    })} width={"10rem"}/>
                </Card>
            </Dashboard>

        </Column>


    </Row>)
}
