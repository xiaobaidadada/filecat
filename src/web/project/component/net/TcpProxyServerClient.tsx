import React, {useContext, useEffect, useMemo, useRef, useState} from 'react'
import {Column, Dashboard, Row, TextLine} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle, TextTip} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows, Table} from "../../../meta/component/Table";
import {InputCheckbox, InputRadio, InputText, Select} from "../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {cryptoHttp, settingHttp, tcpProxy, userHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {SysSoftware, TokenSettingReq} from "../../../../common/req/setting.req";
import {GlobalContext} from "../../GlobalProvider";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {NotyFail, NotySucess} from "../../util/noty";
import {UserAuth, UserData} from "../../../../common/req/user.req";
import {deleteList} from "../../../../common/ListUtil";
import {have_empty_char, join_url} from "../../../../common/StringUtil";
import {
    server_client_proxy, tcp_proxy_bridge_fig_item,
    tcp_proxy_client_item,
    tcp_proxy_server_client,
    tcp_proxy_server_config
} from "../../../../common/req/common.pojo";
import {ws} from "../../util/ws";
import {CmdType} from "../../../../common/frame/WsData";
import { getShortTime } from "../../util/common_util";
import {Global} from "../../util/global";
import {routerConfig} from "../../../../common/RouterConfig";
import {copyToClipboard} from "../../util/FunUtil";

let client_num_id_map:{[key:number]:tcp_proxy_server_client} = {}

export function TcpProxyServerClient() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const [client_list, set_client_list] = useState([] as tcp_proxy_server_client[]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    // const [is_save,set_is_is_save] = useState(false);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);

    const [edit_client,set_edit_client] = useState<tcp_proxy_server_client>();
    const [client_filter_Key,set_client_filter_Key] = useState<string>(undefined)

    const [all_client_options,set_all_client_options] = useState<{label:string,value:string}[]>([])

    const [edit_client_bridge_fig,set_edit_client_bridge_fig] = useState<tcp_proxy_bridge_fig_item[]>([])

    const headers = [t("序号"),t("名称"),t("在线状态"),t("时间"), t("备注") ];
    const client_headers = [t("序号"),t("服务端口"),t("转发ip"),t("转发端口"),t("开启"), t("备注") ];
    const client_bridge_headers = [t("序号"),t("服务端口"),t("转发Client名称"),t("转发ip"),t("转发端口"),t("开启"), t("备注") ];

    const getRelativeTimeText = (stamp?: number) => {
        if (stamp == null) {
            return "";
        }
        return getShortTime(stamp);
    }



    const get_server_bridge_get_one_fig = async (server_client_num_id:number) => {
        const r1 = await tcpProxy.post("server_bridge_get_one_fig",{
            server_client_num_id:server_client_num_id,
        })
        if(r1.code === RCode.Success) {
            const data_list : tcp_proxy_bridge_fig_item[]= r1.data
            for (const data of data_list) {
                data.client_name = client_num_id_map?.[data.client_num_id]?.client_name??''
            }
            set_edit_client_bridge_fig(data_list);
        }
    }

    const resolveClientOption = (value: string | number) => {
        return all_client_options.find((item) => String(item.value) === String(value));
    }

    const getItems = async () => {


        const r2 = await tcpProxy.get("server_client_get")
        if(r2.code === RCode.Success) {
            const list:tcp_proxy_server_client[] = r2.data
            const new_list = []
            const options = []
            client_num_id_map = {}
            for (const item of list) {
                if(client_filter_Key) {
                    if(`${item.index}${item.client_name}${item.note}`.includes(client_filter_Key)) {
                        new_list.push(item)
                    }
                } else {
                    new_list.push(item)
                }
                options.push({
                    label: item.client_name,
                    value: item.client_num_id,
                })
                client_num_id_map[item.client_num_id] = item;
            }
            set_client_list(new_list);
            set_all_client_options(options)
        }



    }


    useEffect(() => {
        ws.addMsg(CmdType.tcp_forward_server_load,(d)=>{
            getItems();
        })
        getItems();
    }, []);

    const save_client_fig = async ()=>{
        const r = await tcpProxy.post("server_client_save",edit_client)
        if(r.code === RCode.Success) {
            NotySucess("成功")
        }
    }
    const server_client_del = async (client_num_id:number) => {
        const r = await tcpProxy.post("server_client_del",{client_num_id})
        if(r.code === RCode.Success) {
            NotySucess("成功")
            getItems()
        }
    }

    const bridge_add = async (item:tcp_proxy_bridge_fig_item) => {
        if(item.client_num_id == null) {
            NotyFail("未选择转发送 client")
            return
        }
        const r = await tcpProxy.post("server_bridge_add_fig",item)
        if(r.code === RCode.Success) {
            NotySucess("成功")
            get_server_bridge_get_one_fig(item.server_client_num_id)

        }
    }

    const bridge_edit = async (item:tcp_proxy_bridge_fig_item) => {
        if(item.client_num_id == null) {
            NotyFail("未选择转发送 client")
            return
        }
        const r = await tcpProxy.post("server_bridge_edit_fig",item)
        if(r.code === RCode.Success) {
            NotySucess("成功")
            get_server_bridge_get_one_fig(item.server_client_num_id)

        }
    }

    const bridge_del = async (id:string,server_client_num_id) => {
        const r = await tcpProxy.post("server_bridge_del_fig",{id})
        if(r.code === RCode.Success) {
            NotySucess("成功")
            get_server_bridge_get_one_fig(server_client_num_id)

        }
    }

    return (<Row>
        <Column widthPer={50}>
            <Dashboard>

                <CardFull self_title={<span className={" div-row "} >
                    <h2>{t("客户端列表")}</h2>
                    {/*<ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/>*/}
                </span>}

              titleCom={<InputText placeholder={t("过滤")} value={client_filter_Key} handleInputChange={(value) => {
                  set_client_filter_Key(value);
              }} handlerEnter={()=>{
                  getItems()
              }}/>}
                          >
                    <Table headers={headers} rows={client_list.map((item:tcp_proxy_server_client, index) => {
                        const new_list = [
                            <p>{index}</p>,
                            <TextTip>{item.client_name}</TextTip>,
                            <StatusCircle ok={item.status} />,
                            <TextTip>{getRelativeTimeText(item.status ? item.online_start_time : item.offline_time)}</TextTip>,
                            <TextTip>{item.note}</TextTip>,
                            <div>
                                <ActionButton icon={"edit"} title={t("编辑")} onClick={() => {
                                    set_edit_client({...item})
                                    get_server_bridge_get_one_fig(item.client_num_id)
                                }}/>
                                <ActionButton icon={"delete"} title={t("删除")} onClick={() => {
                                    set_prompt_card({
                                        open: true,
                                        title: "share file",
                                        confirm: async () => {
                                            set_prompt_card({open: false})
                                            await server_client_del(item.client_num_id)
                                        },
                                        context_div: (
                                            <div className="card-content">
                                                {t("确定删除这个吗客户端吗？")}
                                            </div>
                                        ),

                                    })
                                }}/>
                            </div>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>

        </Column>
        <Column widthPer={50}>
            {
                (edit_client) ?
                <Dashboard>
                <Card self_title={<span
                        className={" div-row "}><h2>{t(`代理配置`)+`-${edit_client?.client_name}`}</h2> </span>}
                          rightBottomCom={<div>
                              <ActionButton icon={"save"} title={t("保存")} onClick={save_client_fig}/>
                          </div>}>
                        <TextLine left={t('远程地址')} center={edit_client?.client_remote_address??""}/>
                        <TextLine
                            left={edit_client?.status ? t("在线时间") : t("离线时间")}
                            center={getRelativeTimeText(edit_client?.status ? edit_client?.online_start_time : edit_client?.offline_time)}
                        />
                        <InputText placeholder={"名称"} value={edit_client.client_name} handleInputChange={(d) => {
                            edit_client.client_name = d
                            set_edit_client({...edit_client})
                        }}/>

                        <form>
                            {t("filecat代理访问")}:<Rows isFlex={true} columns={[
                            <InputRadio value={1} context={t("开启")} selected={edit_client.open_filecat} onchange={() => {
                                edit_client.open_filecat = !edit_client.open_filecat;
                                set_edit_client({...edit_client})
                            }}/>,
                            <InputRadio value={1} context={t("关闭")} selected={!edit_client.open_filecat} onchange={() => {
                                edit_client.open_filecat = !edit_client.open_filecat;
                                set_edit_client({...edit_client})
                            }}/>
                        ]}/>
                        </form>
                        {
                            edit_client.open_filecat &&
                            (<React.Fragment>
                                    <form>
                                        {t("filecat代理访问使用服务器前端")}:<Rows isFlex={true} columns={[
                                        <InputRadio value={1} context={t("开启")} selected={edit_client.filecat_use_local_page} onchange={() => {
                                            edit_client.filecat_use_local_page = !edit_client.filecat_use_local_page;
                                            set_edit_client({...edit_client})
                                        }}/>,
                                        <InputRadio value={1} context={t("关闭")} selected={!edit_client.filecat_use_local_page} onchange={() => {
                                            edit_client.filecat_use_local_page = !edit_client.filecat_use_local_page;
                                            set_edit_client({...edit_client})
                                        }}/>
                                    ]}/>
                                    </form>
                                    <InputText placeholderOut={t("自定义filecat代理地址")} placeholder={"127.0.0.1:5567"} value={edit_client.filecat_proxy_host_port} handleInputChange={(d) => {
                                        edit_client.filecat_proxy_host_port = d
                                        set_edit_client({...edit_client})
                                    }}/>
                                    <ActionButton icon={'content_copy'} title={t('复制filecat代理url')}  onClick={() => {
                                        const url = `${window.location.origin}?tcp_client_num_id=${edit_client.client_num_id}`
                                        copyToClipboard(url)
                                        NotySucess(url)
                                    }}  />
                                </React.Fragment>
                            )
                        }

                        <InputText placeholder={"备注"} value={edit_client.note} handleInputChange={(d) => {
                            edit_client.note = d
                            set_edit_client({...edit_client})
                        }}/>

                        <ActionButton icon={"add"} onClick={() => {
                            edit_client.proxy_fig_list.push({
                                open:false
                            })
                            set_edit_client({...edit_client})
                        }} title={t("添加")}/>
                        {t("代理")}
                        <Table headers={client_headers} rows={edit_client.proxy_fig_list.map((item:tcp_proxy_client_item, index) => {
                            const new_list = [
                                <p>{index}</p>,
                                <InputText value={item.server_port} handleInputChange={(value) => {
                                    item.server_port = parseInt(value);
                                }} no_border={true}/>,
                                <InputText value={item.proxy_host} handleInputChange={(value) => {
                                    item.proxy_host = value;
                                }} no_border={true}/>,
                                <InputText value={item.proxy_port} handleInputChange={(value) => {
                                    item.proxy_port = parseInt(value);
                                }} no_border={true}/>,
                                <Select value={!!item.open} onChange={(value) => {
                                    item.open = value === "true"
                                    set_edit_client({...edit_client})
                                }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,

                                <InputText value={item.note} handleInputChange={(value) => {
                                    item.note = value;
                                }} no_border={true}/>,
                                <div>
                                    <ActionButton icon={"delete"} title={t("删除")} onClick={() => {
                                        const new_list = []
                                        for (let i=0;i<(edit_client.proxy_fig_list.length??0);i++) {
                                            if(i!== index) {
                                                new_list.push(edit_client.proxy_fig_list[i])
                                            }
                                        }
                                        edit_client.proxy_fig_list = new_list
                                        set_edit_client({...edit_client})
                                    }}/>
                                </div>,
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </Card>

                    <Card self_title={<span
                        className={" div-row "}><h2>{t(`桥接配置`)+`-${edit_client?.client_name}`}</h2> </span>}>

                        <ActionButton icon={"add"} onClick={() => {
                            edit_client_bridge_fig.push({
                                open:false,server_client_num_id:edit_client.client_num_id
                            })
                            set_edit_client_bridge_fig([...edit_client_bridge_fig])
                        }} title={t("添加")}/>
                        {t("代理")}

                        <Table headers={client_bridge_headers} rows={edit_client_bridge_fig.map((item:tcp_proxy_bridge_fig_item, index) => {
                            const new_list = [
                                <p>{index}</p>,

                                <InputText value={item.server_port} handleInputChange={(value) => {
                                    item.server_port = parseInt(value);
                                }} no_border={true}/>,
                                <InputText value={item.client_name} options={all_client_options} handleInputChange={(value) => {
                                    // item.server_client_name = value;
                                    // console.log(value)
                                    const selected = resolveClientOption(value);
                                    item.client_num_id = parseInt(String(selected.value));
                                    item.client_name = selected.label;
                                    set_edit_client_bridge_fig([...edit_client_bridge_fig])
                                }} no_border={true}/>,

                                <InputText value={item.client_proxy_host} handleInputChange={(value) => {
                                    item.client_proxy_host = value;
                                }} no_border={true}/>,
                                <InputText value={item.client_proxy_port} handleInputChange={(value) => {
                                    item.client_proxy_port = parseInt(value);
                                }} no_border={true}/>,
                                <Select value={!!item.open} onChange={(value) => {
                                    item.open = value === "true"
                                    set_edit_client_bridge_fig([...edit_client_bridge_fig])
                                }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                                <InputText value={item.note} handleInputChange={(value) => {
                                    item.note = value;
                                }} no_border={true}/>,
                                <div>
                                    <ActionButton icon={"delete"} title={t("删除")} onClick={async () => {
                                        if(item.id == null) {
                                            const new_list = []
                                            for (let i=0;i<(edit_client_bridge_fig.length??0);i++) {
                                                if(i!== index) {
                                                    new_list.push(edit_client_bridge_fig[i])
                                                }
                                            }
                                            set_edit_client_bridge_fig([...new_list])
                                        } else {
                                            await bridge_del(item.id,item.server_client_num_id)
                                        }
                                    }}/>
                                    {
                                        item.id == null ?
                                            <ActionButton icon={"add"} title={t("添加")} onClick={async () => {
                                                await bridge_add(item)
                                            }}/> :
                                            <ActionButton icon={"save"} title={t("保存")} onClick={async () => {
                                                await bridge_edit(item)
                                            }}/>
                                    }
                                </div>,
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </Card>

                </Dashboard> :

                <Dashboard>
                    {/*暂时空白显示*/}
                    </Dashboard>
            }
        </Column>
    </Row>)
}
