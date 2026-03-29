import React, {useContext, useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
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
import {have_empty_char} from "../../../../common/StringUtil";
import {
    server_client_proxy, tcp_proxy_bridge_fig_item,
    tcp_proxy_client_item,
    tcp_proxy_server_client,
    tcp_proxy_server_config
} from "../../../../common/req/common.pojo";


export function TcpProxyServer() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const [client_list, set_client_list] = useState([] as tcp_proxy_server_client[]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    // const [is_save,set_is_is_save] = useState(false);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);
    const [serverPort, setServerPort] = useState(undefined);
    // const [udp_port, set_udp_port] = useState(undefined);
    const [isOpen, setIsOpen] = useState(false);
    // const [key, setKey] = useState("");
    const [edit_client,set_edit_client] = useState<tcp_proxy_server_client>();
    const [online_server,set_online_server] = useState<server_client_proxy[]>([])
    const [option_keys,set_option_keys] = useState<string[]>([])

    const [all_client_options,set_all_client_options] = useState<{label:string,value:string}[]>([])

    const [edit_client_bridge_fig,set_edit_client_bridge_fig] = useState<tcp_proxy_bridge_fig_item[]>([])

    const headers = [t("序号"),t("名称"),t("在线状态"), t("备注") ];
    const client_headers = [t("序号"),t("服务端口"),t("转发ip"),t("转发端口"),t("开启"), t("备注") ];
    const client_bridge_headers = [t("序号"),t("服务端口"),t("转发Client名称"),t("转发ip"),t("转发端口"),t("开启"), t("备注") ];

    const online_server_headers = [t("序号"),t("服务端口"), t("转发ip"),t("转发端口"),"client "+t("名称"),t("端口备注") ];

    const get_server_bridge_get_one_fig = async (server_client_num_id:number) => {
        const r1 = await tcpProxy.post("server_bridge_get_one_fig",{
            server_client_num_id:server_client_num_id,
        })
        if(r1.code === RCode.Success) {
            set_edit_client_bridge_fig(r1.data);
        }
    }

    const getItems = async () => {
        const r1 = await tcpProxy.get("server_get")
        if(r1.code === RCode.Success) {
            // setKey(r1.data.key);
            setServerPort(r1.data.port);
            setIsOpen(r1.data.open);
            set_option_keys(r1.data.option_keys??[]);
        }

        const r2 = await tcpProxy.get("server_client_get")
        if(r2.code === RCode.Success) {
            const list:tcp_proxy_server_client[] = r2.data
            set_client_list(list);
            const options = []
            for (const item of list) {
                options.push({
                    label: item.client_name,
                    value: item.client_num_id,
                })
            }
            set_all_client_options(options)
        }

        const r3 = await tcpProxy.get("get_all_open_server_client_proxy_fig")
        if(r3.code === RCode.Success) {
            set_online_server(r3.data);
        }

    }


    useEffect(() => {
        getItems();
    }, []);
    const save_server_info = async (notice_client:boolean) => {
        const req:tcp_proxy_server_config = new tcp_proxy_server_config()
        req.port = serverPort
        // req.key = key
        req.open = isOpen
        req.option_keys = option_keys;
        const r = await tcpProxy.post("server_save",{
            fig:req,
            notice_client:notice_client
        })
        if(r.code === RCode.Success) {
            NotySucess("成功")
        }
    }
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

    const bridge_add = async (item) => {
        const r = await tcpProxy.post("server_bridge_add_fig",item)
        if(r.code === RCode.Success) {
            NotySucess("成功")
        }
    }

    const bridge_edit = async (item) => {
        const r = await tcpProxy.post("server_bridge_edit_fig",item)
        if(r.code === RCode.Success) {
            NotySucess("成功")
        }
    }

    const bridge_del = async (id:string) => {
        const r = await tcpProxy.post("server_bridge_del_fig",{id})
        if(r.code === RCode.Success) {
            NotySucess("成功")
        }
    }

    return (<Row>
        <Column widthPer={50}>
            <Dashboard>
                <Card title={"Server"} rightBottomCom={<div>
                    <ButtonText text={t('保存并通知客户端第一个key和port')} clickFun={()=>{
                        save_server_info(true)
                    }}/>
                    <ButtonText text={t('保存')} clickFun={()=>{
                        save_server_info(false)
                    }}/>
                </div>}>

                    <InputText placeholder={"port"} value={serverPort} handleInputChange={(d) => {
                        setServerPort(d)
                    }}/>
                    {/*<InputText placeholder={"udp port 不设置p2p服务将无法使用 "} value={udp_port} handleInputChange={(d)=>{set_udp_port(d)}}/>*/}
                    {/*<InputText placeholder={"key "} value={key} handleInputChange={(d) => {*/}
                    {/*    setKey(d)*/}
                    {/*}}/>*/}
                    <label><ActionButton icon={"add"} onClick={() => {
                        set_option_keys([...option_keys, ""])
                    }} title={"添加"}/>{t("key")}</label>
                    {(option_keys ?? []).map((item, index) => {
                        return <div key={index} style={{display: "flex",}}>
                            <div style={{width: "90%"}}><InputText value={item} handleInputChange={(value) => {
                                option_keys[index] = value;
                                set_option_keys([...option_keys]);
                            }}/></div>
                            <ActionButton icon={"delete"} onClick={() => {
                                option_keys.splice(index, 1);
                                set_option_keys([...option_keys]);
                            }} title={"删除"}/>
                        </div>
                    })}
                    <form>
                        {t("状态")}:<Rows isFlex={true} columns={[
                        <InputRadio value={1} context={t("开启")} selected={isOpen} onchange={() => {
                            setIsOpen(!isOpen)
                        }}/>,
                        <InputRadio value={1} context={t("关闭")} selected={!isOpen} onchange={() => {
                            setIsOpen(!isOpen)
                        }}/>
                    ]}/>
                    </form>

                </Card>
                <CardFull self_title={<span className={" div-row "}><h2>{t("Client")}</h2>
                    {/*<ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/>*/}
                </span>}
                          >
                    <Table headers={headers} rows={client_list.map((item:tcp_proxy_server_client, index) => {
                        const new_list = [
                            <p>{index}</p>,
                            <TextTip>{item.client_name}</TextTip>,
                            <StatusCircle ok={item.status} />,
                            <TextTip>{item.note}</TextTip>,
                            <div>
                                <ActionButton icon={"edit"} title={t("编辑")} onClick={() => {
                                    set_edit_client(item)
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
                        className={" div-row "}><h2>{t(`客户端代理配置-${edit_client?.client_name}`)}</h2> </span>}
                          rightBottomCom={<div>
                              <ActionButton icon={"save"} title={t("保存")} onClick={save_client_fig}/>
                          </div>}>
                        <InputText placeholder={"名称"} value={edit_client.client_name} handleInputChange={(d) => {
                            edit_client.client_name = d
                            set_edit_client({...edit_client})
                        }}/>
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
                        className={" div-row "}><h2>{t(`客户端桥接配置-${edit_client?.client_name}`)}</h2> </span>}>

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
                                    item.client_num_id = parseInt(value);
                                }} no_border={true}/>,

                                <InputText value={item.client_proxy_host} handleInputChange={(value) => {
                                    item.client_proxy_host = value;
                                }} no_border={true}/>,
                                <InputText value={item.client_proxy_port} handleInputChange={(value) => {
                                    item.client_proxy_port = parseInt(value);
                                }} no_border={true}/>,
                                <Select value={!!item.open} onChange={(value) => {
                                    item.open = value === "true"
                                    set_edit_client({...edit_client})
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
                                            await bridge_del(item.id)
                                            get_server_bridge_get_one_fig(item.server_client_num_id)
                                        }
                                    }}/>
                                    {
                                        item.id == null ?
                                            <ActionButton icon={"add"} title={t("添加")} onClick={async () => {
                                                await bridge_add(item)
                                                get_server_bridge_get_one_fig(item.server_client_num_id)
                                            }}/> :
                                            <ActionButton icon={"save"} title={t("保存")} onClick={async () => {
                                                await bridge_edit(item)
                                                get_server_bridge_get_one_fig(item.server_client_num_id)
                                            }}/>
                                    }
                                </div>,
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </Card>

                </Dashboard> :

                <Dashboard>
                    <CardFull self_title={<span className={" div-row "}><h2>{t("Online Server Port")}</h2>
                        {/*<ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/>*/}
                        </span>}
                            >
                        <Table headers={online_server_headers} rows={online_server.map((item:server_client_proxy, index) => {
                            const new_list = [
                                <p>{index}</p>,
                                <TextTip>{item.server_port}</TextTip>,
                                <TextTip>{item.proxy_host}</TextTip>,
                                <TextTip>{item.proxy_port}</TextTip>,
                                <TextTip>{item.client_name}</TextTip>,
                                <TextTip>{item.server_port_note}</TextTip>
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </CardFull>
                    </Dashboard>
            }
        </Column>
    </Row>)
}