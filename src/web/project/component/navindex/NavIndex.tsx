import React, {useEffect, useRef, useState} from 'react'
import {NavIndexContainer} from "./component/NavIndexContainer";
import {PromptEnum} from "../prompts/Prompt";
import {$stroe} from "../../util/store";
import {navHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {ButtonLittle} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {useTranslation} from "react-i18next";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import { useAtom } from 'jotai';
import {NotyFail, NotySuccess} from "../../util/noty";



export default function NavIndex() {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const {check_user_auth} = use_auth_check();

    const add =  ()=>{
        setShowPrompt({
            overlay: true,
            data: {},
            show: true,
            type: PromptEnum.NavIndexAdd
        })
    }
    const getItems = async ()=>{
        const result = await navHttp.get();
        if (result.code === RCode.Success) {
            return result.data;
        }
        return [];
    }
    const save = async (items)=>{
        const rsq = await navHttp.post("save",items);
        if (rsq.code === RCode.Success) {
            NotySuccess('保存成功')
        }
    }

    return <>
        <Header>
            {/*<ButtonLittle text={t("添加")} clickFun={add}/>*/}
        </Header>
        <NavIndexContainer have_auth_edit={check_user_auth(UserAuth.net_site_tag_update)} getItems={getItems}  save={save} items={[
            {key:"name",preName:t("名字")},
            {key:"url",preName:"url"},
            {key:"color",preName:"color"}
        ]}/>
    </>
}
