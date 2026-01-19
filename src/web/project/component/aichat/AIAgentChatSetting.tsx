import {useTranslation} from "react-i18next";
import React, {useEffect, useState} from "react";
import {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {FullScreenContext, FullScreenDiv} from "../../../meta/component/Dashboard";


export function AIAgentChatSetting() {

    const {t} = useTranslation();
    const [ai_agent_chat_setting, set_ai_agent_chat_setting] = useRecoilState($stroe.ai_agent_chat_setting);

    return <div>
        <Header>
            <ActionButton icon={"close"} title={t("关闭")} onClick={() => {
                set_ai_agent_chat_setting(false)
            }}/>
        </Header>
        <FullScreenDiv isFull={true} more={true}>
            <FullScreenContext>
                ai设置 3213123

            </FullScreenContext>
        </FullScreenDiv>
    </div>;

}