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
import {tcp_proxy_server_config} from "../../../../common/req/common.pojo";


export function TcpProxyServer() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const [rows, setRows] = useState([]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const [is_create,set_is_create] = useState(false);
    const [is_save,set_is_is_save] = useState(false);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);
    const [serverPort, setServerPort] = useState(undefined);
    // const [udp_port, set_udp_port] = useState(undefined);
    const [isOpen, setIsOpen] = useState(false);
    const [key, setKey] = useState("");

    const [roles,set_roles] = useState([]);
    const headers = [t("序号"),t("name"),t("在线状态"), t("备注") ];


    const getItems = async () => {
        const r1 = await tcpProxy.get("server_get")
        if(r1.code === RCode.Success) {
            setKey(r1.data.key);
            setServerPort(r1.data.port);
            setIsOpen(r1.data.open);
        }
    }


    useEffect(() => {
        getItems();
    }, []);
    const save_server_info = async () => {
        const req:tcp_proxy_server_config = new tcp_proxy_server_config()
        req.port = serverPort
        req.key = key
        req.open = isOpen
        const r = await tcpProxy.post("server_save",req)
        if(r.code === RCode.Success) {
            NotySucess("成功")
        }
    }
    return (<Row>
        <Column widthPer={50}>
            <Dashboard>
                <Card title={"Server"} rightBottomCom={<ButtonText text={t('保存')} clickFun={save_server_info}/>}>

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

                </Card>
                <CardFull self_title={<span className={" div-row "}><h2>{t("Client")}</h2>
                    {/*<ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/>*/}
                </span>}
                          >
                    <Table headers={headers} rows={rows.map((item, index) => {
                        const new_list = [
                            <p>{item.id}</p>,
                            <TextTip>{item.username}</TextTip>,
                            <TextTip>{item.cwd}</TextTip>,
                            <TextTip>{item.note}</TextTip>,
                            <div>
                                <ActionButton icon={"edit"} title={t("编辑")} onClick={() => {}}/>
                                {!item.is_root && <ActionButton icon={"delete"} title={t("删除")} onClick={() => {}}/>}
                            </div>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>

        </Column>
        <Column widthPer={50}>
            {
                (is_create || is_save) &&
                <Dashboard>
                    <Card self_title={<span
                        className={" div-row "}><h2>{t(`${is_create ? "添加" : "编辑"}`)}</h2> </span>}
                          rightBottomCom={<div>
                              <ActionButton icon={"cancel"} title={t("取消")} onClick={() => {
                                  set_is_create(false);
                                  set_is_is_save(false);
                              }}/>
                          </div>}>
                        <label>{t("用户名")}</label>

                    </Card>
                </Dashboard>
            }
        </Column>
    </Row>)
}