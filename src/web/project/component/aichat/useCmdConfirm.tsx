import React, {useCallback, useEffect, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {ws} from '../../util/ws';
import {CmdType, WsData} from '../../../../common/frame/WsData';
import { useAtom } from 'jotai';
import {$stroe} from "../../util/store";
import {Button} from "../../../meta/component/Button";

interface ConfirmRequest {
    askId: string;
    cmd: string;
}

export function useCmdConfirm() {
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);
    const {t} = useTranslation();
    
    // 使用 useRef 存储队列和处理状态，避免闭包问题
    const confirmQueueRef = useRef<ConfirmRequest[]>([]);
    const isProcessingRef = useRef<boolean>(false);

    // 处理队列中的下一个请求（核心逻辑，通过 ref 引用以避免闭包依赖循环）
    const processQueue = useCallback(() => {
        // 如果正在处理中，直接返回
        if (isProcessingRef.current) {
            return;
        }
        
        // 如果队列为空，关闭弹窗
        if (confirmQueueRef.current.length === 0) {
            isProcessingRef.current = false;
            set_prompt_card({open: false});
            return;
        }
        
        // 标记为正在处理
        isProcessingRef.current = true;
        
        // 从队列中取出下一个请求
        const nextRequest = confirmQueueRef.current.shift();
        if (!nextRequest) {
            isProcessingRef.current = false;
            return;
        }

        // 显示确认弹窗
        set_prompt_card({
            open: true,
            title: t('命令确认'),
            cancel: () => {
                ws.sendData(CmdType.ai_confirm_cmd, {askId: nextRequest.askId, approved: false});
                set_prompt_card({open: false});
                isProcessingRef.current = false;
                processQueue();
            },
            context_div: (
                <div>
                    <div style={{
                        maxHeight: '60vh',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        background: 'var(--surfaceSecondary)',
                        padding: '0.75em',
                        borderRadius: '0.5em',
                        marginBottom: '0.75em',
                        fontFamily: 'monospace',
                        fontSize: '0.9em',
                        lineHeight: '1.5'
                    }}>
                        {nextRequest.cmd}
                    </div>
                    <div style={{display: 'flex', gap: '0.5em', justifyContent: 'flex-end'}}>
                        <Button text={t('拒绝')} color={"var(--red)"} clickFun={() => {
                            ws.sendData(CmdType.ai_confirm_cmd, {askId: nextRequest.askId, approved: false});
                            set_prompt_card({open: false});
                            isProcessingRef.current = false;
                            processQueue();
                        }}/>
                        <Button text={t('允许')} clickFun={() => {
                            ws.sendData(CmdType.ai_confirm_cmd, {askId: nextRequest.askId, approved: true});
                            set_prompt_card({open: false});
                            isProcessingRef.current = false;
                            processQueue();
                        }}/>
                    </div>
                </div>
            ),
        });
    }, [t]);

    // 将确认请求添加到队列
    const addToQueue = useCallback((request: ConfirmRequest) => {
        confirmQueueRef.current.push(request);
        processQueue();
    }, [processQueue]);

    // 监听 WS 消息
    useEffect(() => {
        ws.addMsg(CmdType.ai_confirm_cmd, (data: WsData<any>) => {
            const ctx = data.context || {};
            if (ctx.askId && ctx.cmd) {
                addToQueue({
                    askId: ctx.askId,
                    cmd: ctx.cmd
                });
            }
        });

        return () => {
            ws.removeMsg(CmdType.ai_confirm_cmd);
        };
    }, [addToQueue]);

    // 组件卸载时清理队列
    useEffect(() => {
        return () => {
            confirmQueueRef.current = [];
            isProcessingRef.current = false;
        };
    }, []);
}
