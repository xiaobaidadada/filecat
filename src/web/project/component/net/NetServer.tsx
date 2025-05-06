import React, {useEffect, useState} from 'react'
import {netHttp} from "../../util/config";
import {NotyFail, NotySucess} from "../../util/noty";
import {RCode} from "../../../../common/Result.pojo";
import {Column, Row} from "../../../meta/component/Dashboard";
import {Card, StatusCircle, TextTip} from "../../../meta/component/Card";
import {InputCheckbox, InputRadio, InputText} from "../../../meta/component/Input";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Rows, Table} from "../../../meta/component/Table";
import {VirServerEnum, VirServerPojo} from "../../../../common/req/net.pojo";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {useTranslation} from "react-i18next";
import Header from "../../../meta/component/Header";


export function NetServer(props) {
    const {t} = useTranslation();

    const [serverPort, setServerPort] = useState(undefined);
    // const [udp_port, set_udp_port] = useState(undefined);
    const [isOpen, setIsOpen] = useState(false);

    const [key, setKey] = useState("");
    const [headers, setHeaders] = useState([t(`${t("名称")}`), t(`${t("虚拟")}ip`), `${t("物理")}信息`, t("在线状态"), t("选择")]);
    const [rows, setRows] = useState([]);
    const [opt_row, set_opt_row] = useState({});
    const [opt_server_async, set_opt_server_async] = useState(false);

    const status_handle = (list:any[][])=> {
        for (const item of list) {
            const v = item[item.length - 1];
            item[item.length - 1] = <><StatusCircle ok={v} />{v?t("在线"):t("离线")}</>
            item[0] = <TextTip context={item[0]} tip_context={item[0]} />
            item[2] = <TextTip context={item[2]} tip_context={item[2]} />
        }

    }

    useEffect(() => {
        const getItems = async () => {
            const data = new WsData(CmdType.vir_net_serverIno_get);
            const list = await ws.send(data);
            if (list) {
                status_handle(list.context);
                setRows(list.context);
                ws.addMsg(CmdType.vir_net_serverIno_get, (data) => {
                    status_handle(data.context);
                    setRows(data.context);
                })
            }
        }
        getItems();
        const init = async () => {
            const result = await netHttp.get("vir/server/get");
            if (result.code !== RCode.Sucess) {
                return;
            }
            const data = result.data as VirServerPojo;
            setServerPort(data.port);
            setKey(data.key);
            setIsOpen(data.open);
            // set_udp_port(data.udp_port);
            // setInterval(getItems, 1000 * 30)

        }
        init();
        return () => {
            ws.unConnect();
        }
    }, []);
    const save = async () => {
        const pojo = new VirServerPojo();
        pojo.open = isOpen;
        pojo.key = key;
        if(opt_server_async){
            pojo.async_ips = Object.keys(opt_row);
        }
        if (serverPort)
            pojo.port = parseInt(serverPort);
        // if(udp_port)
        // pojo.udp_port = parseInt(udp_port)
        const result = await netHttp.post("vir/server/save", pojo);
        if (result.code !== RCode.Sucess) {
            NotyFail("网络错误")
            return;
        }
        NotySucess("保存成功");
        set_opt_server_async(false);
    }
    const delete_h = async () => {
        await netHttp.post("vir/server/delete/client", {ips: Object.keys(opt_row)});
        set_opt_row({})
    }
    return <div>
        <Header>
            {!!Object.keys(opt_row).length && opt_row[0]}
            {!!Object.keys(opt_row).length && <ActionButton icon={"delete"} title={'删除'} onClick={delete_h}/>}
        </Header>
        <Row>
            <Column>
                <Card title={""} rightBottomCom={<ButtonText text={t('保存')} clickFun={save}/>}>

                    <InputText placeholder={"port"} value={serverPort} handleInputChange={(d) => {
                        setServerPort(d)
                    }}/>
                    {/*<InputText placeholder={"udp port 不设置p2p服务将无法使用 "} value={udp_port} handleInputChange={(d)=>{set_udp_port(d)}}/>*/}
                    <InputText placeholder={"key "} value={key} handleInputChange={(d) => {
                        setKey(d)
                    }}/>
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
                    {!!Object.keys(opt_row).length &&
                        <InputCheckbox context={t("同步信息给选中服务器")} selected={opt_server_async}
                                       onchange={() => {
                                           set_opt_server_async(!opt_server_async);
                                       }}/>}

                </Card>
                <Card title={""}>
                    <Table headers={headers} rows={rows.map((row:any[] )=> {
                        // for (let i = 0;i<row.length;i++) {
                        //     row[i] = <TextTip context={row[i]} tip_context={row[i]} />
                        // }
                        return [...row, <InputCheckbox context={t("")} selected={opt_row[row[1]]}
                                                       onchange={() => {
                                                           const set = {...opt_row}
                                                           if (set[row[1]]) {
                                                               delete set[row[1]];
                                                           } else {
                                                               set[row[1]] = row;
                                                           }
                                                           set_opt_row(set);
                                                       }}/>]
                    })} width={"10rem"}/>
                </Card>
            </Column>
        </Row>
    </div>
}
