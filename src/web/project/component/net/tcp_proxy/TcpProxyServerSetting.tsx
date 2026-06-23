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
import {NotyFail, NotySuccess} from "../../../util/noty";
import {
    server_client_proxy, tcp_proxy_bridge_fig_item,
    tcp_proxy_client_item,
    tcp_proxy_server_client,
    tcp_proxy_server_config, tcp_proxy_sync_task_item
} from "../../../../../common/req/common.pojo";
import {ws} from "../../../util/ws";
import {CmdType} from "../../../../../common/frame/WsData";


export function TcpProxyServerSetting() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [user_base_info,setUser_base_info] = useAtom($stroe.user_base_info);
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);

    const [isOpen, setIsOpen] = useState(false);
    const [online_server,set_online_server] = useState<server_client_proxy[]>([])
    const [sortServerPortAsc, setSortServerPortAsc] = useState(null)

    const [option_keys,set_option_keys] = useState<string[]>([])
    const [serverPort, setServerPort] = useState(undefined);
    const [client_filter_Key,set_client_filter_Key] = useState<string>(undefined)

    const sortedOnlineServer = useMemo(() => {
        const list = [...online_server];
        if(sortServerPortAsc != null) {
            list.sort((a, b) => {
                if (sortServerPortAsc) {
                    return a.server_port - b.server_port;
                }
                return b.server_port - a.server_port;
            });
            return list;
        } else {
            return list;
        }
    }, [online_server, sortServerPortAsc]);

    const get_all_open_server_client_proxy_fig = async ()=>{
        const r3 = await tcpProxy.get("get_all_open_server_client_proxy_fig")
        if(r3.code === RCode.Success) {
            const new_list = []
            for (const item of r3.data as server_client_proxy[]) {
                if(client_filter_Key) {
                    if(`${item.server_port}${item.client_name}${item.proxy_host}${item.server_port}${item.server_port_note}`.includes(client_filter_Key)) {
                        new_list.push(item)
                    }
                } else {
                    new_list.push(item)
                }
            }
            set_online_server(new_list);
        }
    }

    const getItems = async () => {

        const r1 = await tcpProxy.get("server_get")
        if(r1.code === RCode.Success) {
            // setKey(r1.data.key);
            setServerPort(r1.data.port);
            setIsOpen(!!r1.data.open);
            set_option_keys(r1.data.option_keys??[]);
        }
        get_all_open_server_client_proxy_fig()
    }


    useEffect(() => {
        ws.addMsg(CmdType.tcp_forward_server_load,(d)=>{
            getItems();
        })
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
            NotySuccess("成功")
        }
    }

    return (<Row>
        <Column widthPer={50}>
            <Dashboard>
                <Card title={t("服务器配置")} rightBottomCom={<div>
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
                    <label>
                        <ActionButton icon={"add"} onClick={() => {
                        set_option_keys([...option_keys, ""])
                        }} title={t("添加")}/>{t("key")}
                    </label>

                    {(option_keys ?? []).map((item, index) => {
                        return <div key={index} style={{display: "flex",}}>
                            <div style={{width: "90%"}}>
                                <InputText type={"password"} value={item} handleInputChange={(value) => {
                                option_keys[index] = value;
                                set_option_keys([...option_keys]);
                                }}/>
                            </div>
                            <ActionButton icon={"delete"} onClick={() => {
                                option_keys.splice(index, 1);
                                set_option_keys([...option_keys]);
                            }} title={t("删除")}/>
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

            </Dashboard>

        </Column>
        <Column widthPer={50}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}><h2>{t("服务器")+t("端口映射")}</h2>
                    {/*<ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/>*/}
                        </span>}
              titleCom={<InputText placeholder={t("过滤")} value={client_filter_Key} handleInputChange={(value) => {
                  set_client_filter_Key(value);
              }} handlerEnter={()=>{
                  get_all_open_server_client_proxy_fig()
              }}/>}
                >
                    <Table headers={[
                        t("序号"),
                        <ActionButton  title={t("服务端口")} onClick={() => {
                            setSortServerPortAsc(v => !v);
                        }}/>,
                        t("转发ip"),
                        t("转发端口"),
                        "client "+t("名称"),
                        t("开启"),
                        t("备注")
                    ]} rows={sortedOnlineServer.map((item:server_client_proxy, index) => {
                        const new_list = [
                            <p>{index}</p>,
                            <TextTip>{item.server_port}</TextTip>,
                            <TextTip>{item.proxy_host}</TextTip>,
                            <TextTip>{item.proxy_port}</TextTip>,
                            <TextTip>{item.client_name}</TextTip>,
                            <StatusCircle ok={!!item.open_success} />,
                            <TextTip>{item.server_port_note}</TextTip>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>

        </Column>
    </Row>)
}
