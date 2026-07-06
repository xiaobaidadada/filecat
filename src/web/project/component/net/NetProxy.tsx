import React, {useEffect, useState} from 'react'
import {netHttp, settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySuccess} from "../../util/noty";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle} from "../../../meta/component/Card";
import {InputRadio, InputText, Select} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows, Table} from "../../../meta/component/Table";
import {HttpProxy, HttpProxyServerInstance, HttpServerProxy, MacProxy, TcpProxyITem} from "../../../../common/req/net.pojo";
import {useTranslation} from "react-i18next";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../util/store";
import {SysEnum} from "../../../../common/req/user.req";
import {self_auth_jscode} from "../../../../common/req/customerRouter.pojo";
import {editor_data} from "../../util/store.util";
import {generateRandomHash} from "../../../../common/StringUtil";
import {use_select_config} from "../../util/react.config";

export function NetProxy(props) {
    const {t} = useTranslation();

    const [ip, setIp] = useState("");
    const [port, setPort] = useState("");
    const [ignore_ips, setIgnoredIps] = useState("");
    const [enabled, setEnabled] = useState(false);
    const [useForLocal, setUseForLocal] = useState<boolean>(false);
    const [httpServer, setHttpServer] = useState<HttpServerProxy>({list: []});
    const [editorSetting, setEditorSetting] = useAtom($stroe.editorSetting);

    const [user_base_info, setUser_base_info] = useAtom($stroe.user_base_info);

    // tcp代理
    const tcp_proxy_list_header = [t("端口"), t("目标地址"), t("目标端口"), t("开启"), t("备注"), t("删除")];
    const [tcp_proxy_list, set_tcp_proxy_list] = useState([] as TcpProxyITem[]);
    // const [tcp_proxy_status, set_tcp_proxy_status] = useState({});

    const mac_proxy_list_header = [t("port"), t("ip"), t("type"), t("开启")];
    const [mac_proxies, setMacProxies] = useState<MacProxy[]>([]);

    const http_proxy_list_header = [t("编辑"), t("开启"), t("备注"), t("删除")];
    const select_list = use_select_config()


    const win_proxy_init = async () => {
        const proxy = await netHttp.post("http/proxy/get/win");
        if (proxy.code === RCode.Success) {
            const pojo = proxy.data as HttpProxy
            setIp(pojo.ip)
            setPort(pojo.port)
            setEnabled(pojo.enabled)
            setIgnoredIps(pojo.bypass)
            setUseForLocal(pojo.useForLocal)
        }
    }

    const mac_proxy_init = async () => {
        const proxy = await netHttp.post("http/proxy/get/mac");
        if(proxy.code !== RCode.Success) {
            return;
        }
        const list = []
        const others = []
        for (const p of proxy.data as MacProxy[]) {
            if (p.name === "Wi-Fi") {
                list.push(p)
            } else {
                others.push(p)
            }
        }
        // console.log([...list,...others])
        setMacProxies([...list, ...others]);
        // console.log(proxy)
        // if (proxy.code === RCode.Sucess) {
        //     const pojo = proxy.data as HttpProxy
        //     setIp(pojo.ip)
        //     setPort(pojo.port)
        //     setEnabled(pojo.enabled)
        //     setIgnoredIps(pojo.bypass)
        //     setUseForLocal(pojo.useForLocal)
        // }
    }


    const init = async () => {
        const list = [netHttp.post("vir/client/tcp_proxy/get"), netHttp.post("http/proxy/server/get")]
        let post: any
        if (user_base_info.sys === SysEnum.mac) {
            post = mac_proxy_init();
        } else if (user_base_info.sys === SysEnum.win) {
            post = win_proxy_init();
        }
        if (post) {
            list.push(post)
        }
        // 获取tcp代理
        const [rtcp, httpProxy] = await Promise.all(list);
        if (rtcp.code === RCode.Success) {
            set_tcp_proxy_list(rtcp.data)
        }
        if (httpProxy.code === RCode.Success) {
            // console.log(httpProxy.data)
            setHttpServer(httpProxy.data)
        }
    }

    useEffect(() => {
        init();
    }, []);

    const save_http_proxy_win = async () => {
        const pojo = new HttpProxy()
        pojo.port = parseInt(port)
        pojo.enabled = enabled
        pojo.useForLocal = useForLocal
        pojo.ip = ip
        pojo.bypass = ignore_ips
        const result = await netHttp.post("http/proxy/set/win", pojo);
        if (result.code === RCode.Success) {
            init();
            NotySuccess("保存成功")
        }
    }

    const save_proxy_mac = async (index1) => {
        const pojo = mac_proxies[index1]
        const result = await netHttp.post("http/proxy/set/mac", [pojo]);
        if (result.code === RCode.Success) {
            init();
            NotySuccess("保存成功")
        }
    }
    const save_outside_software = async () => {
        const list = [];
        for (let i = 0; i < tcp_proxy_list.length; i++) {
            tcp_proxy_list[i].index = i;
            list.push(tcp_proxy_list[i]);
        }
        const result = await netHttp.post("vir/client/tcp_proxy/save", list);
        if (result.code === RCode.Success) {
            NotySuccess("保存成功")
            init()
        }
    }

    const http_proxy_save = async () => {
        const result = await netHttp.post("http/proxy/server/save", httpServer);
        if (result.code === RCode.Success) {
            init();
            NotySuccess("保存成功")
        }
    }

    const tcp_del = (index) => {
        tcp_proxy_list.splice(index, 1);
        set_tcp_proxy_list([...tcp_proxy_list]);
    }
    const tcp_add = () => {
        set_tcp_proxy_list([...tcp_proxy_list, {
            note: "",
            open: false,
            port: 0,
            target_port: 0,
            target_ip: ""
        } as TcpProxyITem]);
    }
    // const tcp_onChange = (item, value, index) => {
    //     const list = [];
    //     for (let i = 0; i < tcp_proxy_list.length; i++) {
    //         if (i !== index) {
    //             tcp_proxy_list[i].open = false;
    //         } else {
    //             tcp_proxy_list[i].open = value === "true";
    //         }
    //         list.push(tcp_proxy_list[i])
    //     }
    //     // setRows([]);
    //     set_tcp_proxy_list(list);
    // }

    const mac_onChange = (index1, index2, value) => {
        const list = [...mac_proxies];
        list[index1].proxies[index2].enabled = value
        setMacProxies(list);
    }

    /**
     * 编辑某个端口实例下的某个规则项的 js 代码
     * @param instanceIndex 端口实例在 list 中的索引
     * @param itemIndex 规则项在该端口实例 list 中的索引
     */
    const httpProxyEdit = async (instanceIndex, itemIndex) => {
        const instance = httpServer.list[instanceIndex];
        if (!instance) return;
        const item = instance.list[itemIndex];
        if (!item) return;
        if (!item.random_key) {
            item.random_key = generateRandomHash()
            setHttpServer({...httpServer});
            await http_proxy_save()
        }
        const res = await netHttp.post(`http/proxy/server/code/get`, {key: item.random_key, name: item.random_key});
        setEditorSetting({
            model: "ace/mode/javascript",
            open: true,
            fileName: "",
            can_format: true,
            save: async (context) => {
                const rsq = await netHttp.post("http/proxy/server/code/save", {
                    context,
                    key: item.random_key
                });
                if (rsq.code === 0) {
                    editor_data.set_value_temp('')
                    setEditorSetting({open: false, model: '', fileName: '', save: null})
                }
            }
        })
        editor_data.set_value_temp(res.data)
    }
    return <div>
        <Row>

            {
                user_base_info.sys === SysEnum.win && <Column>
                    <Card title={"Http Proxy"}
                          rightBottomCom={<ButtonText text={t('保存')} clickFun={save_http_proxy_win}/>}>
                        <InputText placeholder={"ip (default localhost) "} value={ip} handleInputChange={(d) => {
                            setIp(d)
                        }}/>
                        <InputText placeholder={"port "} value={port} handleInputChange={(d) => {
                            setPort(d)
                        }}/>
                        <InputText placeholder={t('忽略ip')} value={ignore_ips} handleInputChange={(d) => {
                            setIgnoredIps(d)
                        }}/>

                        <form>
                            {t("请勿将代理服务器用于本地(Intranet)地址")}
                            <Rows isFlex={true} columns={[
                                <InputRadio value={1} context={t("开启")} selected={useForLocal} onchange={() => {
                                    setUseForLocal(!useForLocal)
                                }}/>,
                                <InputRadio value={1} context={t("关闭")} selected={!useForLocal} onchange={() => {
                                    setUseForLocal(!useForLocal)
                                }}/>
                            ]}/>
                        </form>
                        <form>
                            {t("状态")}
                            <Rows isFlex={true} columns={[
                                <InputRadio value={1} context={t("开启")} selected={enabled} onchange={() => {
                                    setEnabled(!enabled)
                                }}/>,
                                <InputRadio value={1} context={t("关闭")} selected={!enabled} onchange={() => {
                                    setEnabled(!enabled)
                                }}/>
                            ]}/>
                        </form>

                    </Card>
                </Column>
            }

            {
                user_base_info.sys === SysEnum.mac && <Column>
                    {mac_proxies.map((proxy, index1) => <CardFull key={index1} self_title={<span
                        className={" div-row "}><h2>{proxy.name}</h2> </span>}
                                                                  titleCom={<div><ActionButton
                                                                      icon={"save"} title={t("保存")}
                                                                      onClick={() => {
                                                                          save_proxy_mac(index1)
                                                                      }}/></div>}>
                        <Table headers={mac_proxy_list_header} rows={proxy.proxies.map((item, index) => {
                            const new_list = [
                                <InputText value={item.port} handleInputChange={(value) => {
                                    item.port = parseInt(value);
                                }} no_border={true}/>,
                                <InputText value={item.ip} handleInputChange={(value) => {
                                    item.ip = value;
                                }} no_border={true}/>,
                                <div>
                                    {item.type === 1 ? "http" : "https"}
                                </div>,
                                <Select value={item.enabled} onChange={(value) => {
                                    mac_onChange(index1, index, value);
                                }} options={select_list}
                                        no_border={true}/>
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                        ignore ips
                        <InputText value={proxy.bypass} handleInputChange={(value) => {
                            mac_proxies[index1].bypass = value;
                        }} no_border={true}/>
                    </CardFull>)}
                </Column>
            }

            <Column>
                <CardFull self_title={<span className={" div-row "}><h2>{t("Tcp Proxy")}</h2> </span>}
                          titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={tcp_add}/><ActionButton
                              icon={"save"} title={t("保存")} onClick={save_outside_software}/></div>}>
                    <Table headers={tcp_proxy_list_header} rows={tcp_proxy_list.map((item, index) => {
                        const new_list = [
                            <InputText value={item.port} handleInputChange={(value) => {
                                item.port = parseInt(value);
                            }} no_border={true}/>,
                            <InputText value={item.target_ip} handleInputChange={(value) => {
                                item.target_ip = value;
                            }} no_border={true}/>,
                            <InputText value={item.target_port} handleInputChange={(value) => {
                                item.target_port = parseInt(value);
                            }} no_border={true}/>,
                            <Select value={item.open} onChange={(value) => {
                                tcp_proxy_list[index].open = value
                                set_tcp_proxy_list([...tcp_proxy_list]);
                            }} options={select_list}
                                    no_border={true}/>,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <div>
                                <ActionButton icon={"delete"} title={t("删除")} onClick={() => tcp_del(index)}/>
                            </div>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>


                <CardFull self_title={<span className={" div-row "}><h2>{t("Http Proxy Server")}</h2> </span>}
                          titleCom={<div>
                              <ActionButton icon={"add"} title={t("添加端口实例")} onClick={() => {
                                  httpServer.list.push({
                                      open: false,
                                      port: 0,
                                      note: "",
                                      list: []
                                  })
                                  setHttpServer({...httpServer})
                              }}/>
                              <ActionButton icon={"save"} title={t("保存")} onClick={http_proxy_save}/>
                          </div>}>

                    {/* 遍历每个端口实例 */}
                    {httpServer.list.map((instance, instanceIndex) => (
                        <div key={instanceIndex} className={"net-proxy-instance"}>
                            {/* 端口实例头部：状态 + 端口 + 备注 + 操作按钮 */}
                            <div className={"net-proxy-instance__toolbar"}>
                                <span className={"net-proxy-instance__label"}>{t("端口实例")} #{instanceIndex + 1}</span>
                                <span>{t("状态")}</span>
                                <Select value={instance.open} width={"15%"} onChange={(value) => {
                                    instance.open = value;
                                    setHttpServer({...httpServer})
                                }} options={select_list} no_border={true}/>
                                <span>{t("端口")}</span>
                                <InputText value={instance.port || ''} handleInputChange={(value) => {
                                    instance.port = value ? parseInt(value) : 0;
                                    setHttpServer({...httpServer})
                                }} no_border={true} width={'80px'}/>
                                <ActionButton icon={"add"} title={t("添加规则")} onClick={() => {
                                    instance.list.push({
                                        note: "",
                                        open: false
                                    })
                                    setHttpServer({...httpServer})
                                }}/>
                                <ActionButton icon={"delete"} title={t("删除端口实例")} onClick={() => {
                                    httpServer.list.splice(instanceIndex, 1);
                                    setHttpServer({...httpServer})
                                }}/>

                                <InputText placeholder={t("备注")} width={"100%"} value={instance.note} handleInputChange={(value) => {
                                    instance.note = value;
                                    setHttpServer({...httpServer})
                                }} no_border={true} />
                            </div>

                            {/* 规则列表 Table */}
                            <Table headers={http_proxy_list_header} rows={instance.list.map((item, itemIndex) => {
                                const new_list = [
                                    <div>
                                        <ActionButton icon={"edit"} title={t("编辑")} onClick={() => {
                                            httpProxyEdit(instanceIndex, itemIndex)
                                        }}/>
                                    </div>,
                                    <Select value={item.open} onChange={(value) => {
                                        instance.list[itemIndex].open = value
                                        setHttpServer({...httpServer})
                                    }} options={select_list} no_border={true}/>,
                                    <InputText value={item.note} handleInputChange={(value) => {
                                        item.note = value;
                                    }} no_border={true}/>,
                                    <div>
                                        <ActionButton icon={"delete"} title={t("删除")} onClick={() => {
                                            instance.list.splice(itemIndex, 1);
                                            setHttpServer({...httpServer})
                                        }}/>
                                    </div>,
                                ];
                                return new_list;
                            })} width={"10rem"}/>
                        </div>
                    ))}
                </CardFull>

            </Column>


        </Row>
    </div>
}
