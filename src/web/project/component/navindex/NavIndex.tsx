import React, {useEffect, useRef, useState} from 'react'
import {NavIndexContainer} from "./component/NavIndexContainer";
import {PromptEnum} from "../prompts/Prompt";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {navHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {ButtonLittle} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {useTranslation} from "react-i18next";



export default function NavIndex() {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);

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
        if (result.code === RCode.Sucess) {
            return result.data;
        }
        return [];
    }
    const save = async (items)=>{
        const rsq = await navHttp.post("save",items);
        if (rsq.code !== RCode.Sucess) {
            new Noty({
                type: 'error',
                text: '网络错误',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }

    return <div>
        <Header>
            {/*<ButtonLittle text={t("添加")} clickFun={add}/>*/}
        </Header>
        <NavIndexContainer getItems={getItems}  save={save} items={[{key:"name",preName:t("名字")},{key:"url",preName:"url"}]}/>
    </div>
}
