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
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {NotyFail, NotySucess} from "../../../util/noty";
import {UserAuth, UserData} from "../../../../../common/req/user.req";
import {deleteList} from "../../../../../common/ListUtil";
import {have_empty_char} from "../../../../../common/StringUtil";
import {
    server_client_proxy, tcp_proxy_bridge_fig_item,
    tcp_proxy_client_item,
    tcp_proxy_server_client,
    tcp_proxy_server_config, tcp_proxy_sync_task_item
} from "../../../../../common/req/common.pojo";
import {ws} from "../../../util/ws";
import {CmdType} from "../../../../../common/frame/WsData";


export function TcpProxyServerClientSetting() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);


    const [sync_task_list,set_sync_task_list] = useState<(tcp_proxy_sync_task_item & {ignore_text?: string})[]>([])

    const sync_task_headers = [t("编号"), t("原客户端"), t("原目录"), t("目标客户端"), t("目标目录"), t("忽略目录"), t("开启"),t("双向同步"), t("备注")];

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
            const list = (r.data as tcp_proxy_sync_task_item[]).map((item) => ({
                ...item,
                ignore_text: (item.ignore_list ?? []).join(";"),
            }));
            set_sync_task_list(list as any);
        }
    }

    const resolveClientOption = (value: string | number) => {
        return all_client_options.find((item) => String(item.value) === String(value));
    }

    const save_sync_task = async (item: tcp_proxy_sync_task_item & {ignore_text?: string}) => {
        const payload: tcp_proxy_sync_task_item = {
            ...item,
            ignore_list: (item.ignore_text ?? "")
                .split(/[\n,]/)
                .map((v) => v.trim())
                .filter(Boolean),
        };
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
                <Card self_title={<span className={" div-row "}><h2>{t(`客户端文件同步`)}</h2> </span>}>
                    <ActionButton icon={"add"} onClick={() => {
                        const defaultSource = all_client_options?.[0]?.value;
                        const defaultTarget = all_client_options?.[1]?.value ?? all_client_options?.[0]?.value;
                        sync_task_list.push({
                            open: false,
                            source_client_num_id: defaultSource ? parseInt(String(defaultSource)) : undefined,
                            target_client_num_id: defaultTarget ? parseInt(String(defaultTarget)) : undefined,
                            source_dir: "",
                            target_dir: "",
                            ignore_text: "",
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
                                // item.source_client_name = selected?.label;
                                set_sync_task_list([...sync_task_list])
                            }} no_border={true}/>,
                            <InputText value={item.source_dir} handleInputChange={(value) => {
                                item.source_dir = value;
                            }} no_border={true}/>,
                            <InputText value={targetOpt?.label ?? item.target_client_name} options={all_client_options} handleInputChange={(value) => {
                                const selected = resolveClientOption(value);
                                item.target_client_num_id = parseInt(String(selected?.value));
                                // item.target_client_name = selected?.label;
                                set_sync_task_list([...sync_task_list])
                            }} no_border={true}/>,
                            <InputText value={item.target_dir} handleInputChange={(value) => {
                                item.target_dir = value;
                            }} no_border={true}/>,
                            <InputText value={item.ignore_text} placeholder={'dir1;file2'} handleInputChange={(value) => {
                                item.ignore_text = value;
                            }} no_border={true}/>,
                            <Select value={!!item.open} onChange={(value) => {
                                item.open = value === "true"
                                set_sync_task_list([...sync_task_list])
                            }}  options={[{title:t("开启"),value:true},{title:t("关闭"),value:false}]} no_border={true}/>,
                            <Select value={!!item.two_way_sync} onChange={(value) => {
                                item.two_way_sync = value === "true"
                                set_sync_task_list([...sync_task_list])
                            }}  options={[{title:t("开启"),value:true},{title:t("关闭"),value:false}]} no_border={true}/>,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <div>
                                <ActionButton icon={"save"} title={t("保存")} onClick={() => {
                                    save_sync_task(item)
                                }}/>
                                <ActionButton icon={"delete"} title={t("删除")} onClick={() => {
                                    if (item.id) {
                                        del_sync_task(item.id)
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
