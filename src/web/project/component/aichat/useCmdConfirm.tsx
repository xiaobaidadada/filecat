import React, {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ws} from '../../util/ws';
import {CmdType, WsData} from '../../../../common/frame/WsData';
import {InputText} from "../../../meta/component/Input";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import  {Button} from "../../../meta/component/Button";


export function useCmdConfirm() {
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const {t} = useTranslation();


    // 处理用户的确认/拒绝响应
    const handleCmdConfirmResponse = useCallback((askId: string, approved: boolean) => {
        ws.sendData(CmdType.ai_confirm_cmd, {askId, approved});
        set_prompt_card({open:false})
    }, []);

    // 监听 WS 消息
    useEffect(() => {
        ws.addMsg(CmdType.ai_confirm_cmd, (data: WsData<any>) => {
            const ctx = data.context || {};
            if (ctx.askId && ctx.cmd) {
                set_prompt_card({
                    open: true,
                    title: t('命令确认'),
                    cancel:()=>{
                        handleCmdConfirmResponse(ctx.askId, false)
                    },
                    context_div: (
                        <div>
                            <span>${ctx.cmd}</span>
                            <Button text={t('拒绝')} clickFun={() => handleCmdConfirmResponse(ctx.askId, false)}/>
                            <Button text={t('允许')} clickFun={() => handleCmdConfirmResponse(ctx.askId, true)}/>
                        </div>
                    ),

                })
            }
        });

        return () => {
            ws.removeMsg(CmdType.ai_confirm_cmd);
        };
    }, []);

    // return {
    //     cmdConfirm,
    //     handleCmdConfirmResponse,
    // };
}
