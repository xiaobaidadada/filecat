import React, {useEffect, useRef, useState} from 'react'

import {NavIndexContainer} from "../navindex/component/NavIndexContainer";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {TimeConverTer} from "./TimeConverTer";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {InputTextIcon, Select} from "../../../meta/component/Input";
import Header from "../../../meta/component/Header";
import {useTranslation} from "react-i18next";
import {Rows} from "../../../meta/component/Table";
import {Card} from "../../../meta/component/Card";
import {cryptoHttp, sysHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {NotyFail, NotySucess} from "../../util/noty";
import {copyToClipboard} from "../../util/FunUtil";

let home_path;

export function Crypto() {
    const [method, set_method] = useState('rsa'); // 算法
    const [form, set_form] = useState('pem') // 格式
    const {t, i18n} = useTranslation();
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);
    const [publicKey, set_publicKey] = useState('');
    const [privateKey, set_privateKey] = useState('');

    const generate = async () => {
        const result = await cryptoHttp.post("generate", {type: method, form});
        if (result.code === RCode.Sucess) {
            set_publicKey(result.data.public_key);
            set_privateKey(result.data.private_key);
            home_path = result.data.home_path;
        }
    }

    const save_openssh = async (type) => {
        if (!privateKey || !publicKey) {
            NotyFail("密钥不能为空");
            return;
        }
        let name = "id_"+method;
        if (type === "pub") {
            name += ".pub";
        }
        setShowPrompt({
            open: true,
            title: "将覆盖密钥文件",
            sub_title: `将会作为 ${name} 文件保存到系统上的"${home_path}"目录下，此目录会作为openssh(git)所使用的默认目录。之前的密钥将作废。`,
            handle: async () => {
                const result = await cryptoHttp.post("save_openssh", {
                    name,
                    context: type === "pub" ? publicKey : privateKey,
                });
                if (result.code === RCode.Sucess) {
                    NotySucess("保存成功");
                    setShowPrompt({open:false,handle:null});
                }
            }
        })
    }
    return (<div>
        <Dashboard>
            <Header>
                <Rows isFlex={true} columns={[
                    <Select tip={"加密算法"} value={method} width={"auto"} onChange={(value) => {
                        set_method(value)
                    }} options={[{title: t("RSA"), value: 'rsa'}, {title: t("DSA"), value: 'dsa'},{title: t("ECDSA"), value: 'ecdsa'}]}/>
                    , <Select tip={"输出格式"} value={form} width={"auto"} onChange={(value) => {
                        set_form(value)
                    }} options={[{title: t("普通PEM"), value: 'pem'}, {title: t("opensshPEM"), value: 'openssh_pem'}]}/>
                    , <ActionButton icon={"play_arrow"} title={t("生成")} onClick={() => {
                        generate();
                    }}/>
                ]}/>
            </Header>
            <Row>
                <Column>
                    <Card title={"公钥"} titleCom={<ActionButton title={"复制"} icon={"copy_all"} onClick={()=>{
                        if (publicKey) {
                            copyToClipboard(publicKey);
                            NotySucess("复制完成")
                        }
                    }}/>}
                          rightBottomCom={form === "openssh_pem" &&
                              <ButtonText text={t('保存到.ssh目录')} clickFun={() => {
                                  save_openssh('pub')
                              }}/>}
                    >
                        <textarea className={"input--textarea input--no_border"}
                                  style={{
                                      width: "100%",
                                      height: "270px",
                                  }}
                                  onChange={(event) => {
                                      set_publicKey(event.target.value)
                                  }}
                                  value={publicKey}
                        ></textarea>
                    </Card>
                </Column>
                <Column>
                    <Card title={"私钥"} titleCom={<ActionButton title={"复制"} icon={"copy_all"} onClick={()=>{
                        if (privateKey) {
                            copyToClipboard(privateKey);
                            NotySucess("复制成功")
                        }
                    }}/>}
                          rightBottomCom={form === "openssh_pem" &&
                              <ButtonText text={t('保存到.ssh目录')} clickFun={() => {
                                  save_openssh('pri')
                              }}/>}>
                        <textarea className={"input--textarea input--no_border"}
                                  style={{
                                      width: "100%",
                                      height: "270px",
                                  }}
                                  value={privateKey}
                                  onChange={(event) => {
                                      set_privateKey(event.target.value)
                                  }}
                        ></textarea>
                    </Card>
                </Column>
            </Row>
        </Dashboard>
    </div>);
}