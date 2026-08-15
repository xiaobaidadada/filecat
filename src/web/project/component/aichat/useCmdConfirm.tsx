import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ws} from '../../util/ws';
import {CmdType, WsData} from '../../../../common/frame/WsData';
import { useAtom } from 'jotai';
import {$stroe} from "../../util/store";
import Switch, {Button} from "../../../meta/component/Button";
import {ai_agentHttp} from "../../util/config";

interface ConfirmRequest {
    askId: string;
    cmd: string;
    session_id?: string;
}

/**
 * 命令确认弹框内容组件
 * - 展示待确认的命令
 * - 可选「此会话不再询问」：开启后该会话后续命令都不再弹确认（自动允许）
 */
function CmdConfirmDialog(props: {
    cmd: string;
    sessionId?: string;
    onDeny: () => void;
    onAllow: () => void;
    onAutoAllow: () => void;
}) {
    const {t} = useTranslation();
    const [neverAsk, setNeverAsk] = useState(false);
    const hasSession = !!props.sessionId;
    return (
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
                {props.cmd}
            </div>
            {hasSession && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5em',
                    marginBottom: '0.75em',
                    color: neverAsk ? 'var(--icon-blue)' : 'var(--textSecondary)'
                }}>
                    <Switch
                        checked={neverAsk}
                        onChange={(next) => {
                            setNeverAsk(next);
                            // 勾选“此会话不再询问”：立即允许本次命令，并标记该会话以后不再确认
                            if (next) props.onAutoAllow();
                        }}
                        title={t('此会话不再询问')}
                    />
                    <span>{t('此会话不再询问')}</span>
                </div>
            )}
            <div style={{display: 'flex', gap: '0.5em', justifyContent: 'flex-end'}}>
                <Button text={t('拒绝')} color={"var(--red)"} clickFun={props.onDeny}/>
                <Button text={t('允许')} clickFun={props.onAllow}/>
            </div>
        </div>
    );
}

export function useCmdConfirm() {
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);
    const {t} = useTranslation();
    
    // 使用 useRef 存储队列和处理状态，避免闭包问题
    const confirmQueueRef = useRef<ConfirmRequest[]>([]);
    const isProcessingRef = useRef<boolean>(false);

    // 记录当前正在展示确认弹框的 askId
    const confirmedAskRef = useRef<string | null>(null);
    // 当前正在展示确认弹框的 session_id
    const confirmedSessionRef = useRef<string | undefined>(undefined);

    // 用 ref 保存 processQueue，供 closeAndNext 调用（避免 useCallback 循环依赖）
    const processQueueRef = useRef<() => void>(() => {});

    // 关闭当前弹框并处理队列中的下一个请求（approved 为本次确认结果）
    const closeAndNext = useCallback((approved: boolean) => {
        set_prompt_card({open: false});
        isProcessingRef.current = false;
        // 队列中已取出的那个请求需要回填 confirmed 结果（发送给后端）
        if (confirmedAskRef.current) {
            ws.sendData(CmdType.ai_confirm_cmd, {
                askId: confirmedAskRef.current,
                approved
            });
            confirmedAskRef.current = null;
        }
        processQueueRef.current();
    }, [set_prompt_card]);

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

        // 记录当前请求，供弹框组件操作时使用
        confirmedAskRef.current = nextRequest.askId;
        confirmedSessionRef.current = nextRequest.session_id;

        // 显示确认弹窗
        set_prompt_card({
            open: true,
            title: t('命令确认'),
            cancel: () => closeAndNext(false),
            context_div: (
                <CmdConfirmDialog
                    cmd={nextRequest.cmd}
                    sessionId={nextRequest.session_id}
                    onDeny={() => closeAndNext(false)}
                    onAllow={() => closeAndNext(true)}
                    onAutoAllow={async () => {
                        // 标记该会话“命令不再询问”：后端会记录，之后该会话命令自动允许
                        if (confirmedSessionRef.current) {
                            try {
                                await ai_agentHttp.post("session/cmd_auto_allow", {
                                    session_id: confirmedSessionRef.current,
                                    allow: true
                                });
                            } catch (e) {
                                console.error("设置会话命令免确认失败", e);
                            }
                        }
                        // 允许本次命令执行
                        closeAndNext(true);
                    }}
                />
            ),
        });
    }, [t, closeAndNext, set_prompt_card]);

    // 每次 render 把最新的 processQueue 挂到 ref，供 closeAndNext 调用（避免循环依赖）
    processQueueRef.current = processQueue;

    // 将确认请求添加到队列
    const addToQueue = useCallback((request: ConfirmRequest) => {
        confirmQueueRef.current.push(request);
        processQueue();
    }, [processQueue]);

    // 监听 WS 消息
    useEffect(() => {
        ws.addMsg(CmdType.ai_confirm_cmd, (data: WsData<any>) => {
            const ctx = data.context || {};
            // 如果收到 dismiss（已被其他标签页处理），从队列中移除
            if (ctx.dismiss && ctx.askId) {
                confirmQueueRef.current = confirmQueueRef.current.filter(
                    req => req.askId !== ctx.askId
                );
                // 如果当前正在显示的就是这个 askId，关闭弹窗并继续处理下一个
                if (isProcessingRef.current && confirmedAskRef.current === ctx.askId) {
                    confirmedAskRef.current = null;
                    isProcessingRef.current = false;
                    set_prompt_card({open: false});
                    processQueue();
                }
                return;
            }
            if (ctx.askId && ctx.cmd) {
                addToQueue({
                    askId: ctx.askId,
                    cmd: ctx.cmd,
                    session_id: ctx.session_id,
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
            confirmedAskRef.current = null;
        };
    }, []);
}

