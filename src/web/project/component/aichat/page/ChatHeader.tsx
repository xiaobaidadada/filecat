/**
 * ChatHeader — 聊天页顶部操作栏组件
 * 包含：会话切换、新建会话、系统提示词选择、请求类型选择、
 *       模型切换、批量选择、清空会话、跳转设置等
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import Header from "../../../../meta/component/Header";
import { ActionButton } from "../../../../meta/component/Button";
import { Select } from "../../../../meta/component/Input";
import { use_auth_check } from "../../../util/store.util";
import { UserAuth } from "../../../../../common/req/user.req";
import { NotySuccess } from "../../../util/noty";
import { RCode } from "../../../../../common/Result.pojo";
import { routerConfig } from "../../../../../common/RouterConfig";
import { settingHttp, ai_agentHttp } from "../../../util/config";
import { $stroe } from "../../../util/store";
import { ai_system_prompt_item, ai_agent_item_dotenv } from "../../../../../common/req/filecat.ai.pojo";
import {MenuSelect} from "../../prompts/Prompt";

interface ChatHeaderProps {
    /** 当前模型名称 */
    currentModelName: string;
    /** 设置当前模型名称 */
    setCurrentModelName: (v: string) => void;
    /** 环境配置引用 */
    envConfigRef: React.MutableRefObject<ai_agent_item_dotenv>;
    /** 系统提示词列表 */
    sysPromptList: ai_system_prompt_item[];
    /** 批量模式 */
    batchMode: boolean;
    /** 已选消息数 */
    selectedMsgCount: number;
    /** 切换会话面板 */
    onToggleSessionPanel: () => void;
    /** 创建新会话 */
    onCreateSession: (sysPrompt?: string) => void;
    /** 切换批量模式（消息气泡多选入口） */
    onToggleBatchMode: () => void;
    /** 批量删除消息 */
    onBatchDeleteMessages: () => void;
    /** 后台进程面板是否可见 */
    bgProcessVisible?: boolean;
    /** 切换后台进程面板 */
    onToggleBgProcess?: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
    currentModelName,
    setCurrentModelName,
    envConfigRef,
    sysPromptList,
    batchMode,
    selectedMsgCount,
    onToggleSessionPanel,
    onCreateSession,
    onToggleBatchMode,
    onBatchDeleteMessages,
    bgProcessVisible,
    onToggleBgProcess,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { check_user_auth } = use_auth_check();
    const [, set_ai_session_collapsed] = useAtom($stroe.ai_session_collapsed);

    return (
        <Header>
            <ActionButton
                icon={"menu"}
                title={t("会话")}
                onClick={onToggleSessionPanel}
            />
            <ActionButton icon={"add"} title={t("新会话")} onClick={() => onCreateSession()} />
            {sysPromptList.length > 0 && (
                <MenuSelect
                    list={sysPromptList.map((item, idx) => ({
                        name: item.note || `${t("提示词")} ${idx + 1}`,
                        click: () => {
                            if (item.prompt) {
                                onCreateSession(item.prompt);
                            }
                        }
                    }))}
                >
                    <ActionButton icon={"add_comment"} title={t("提示词模板创建会话")} />
                </MenuSelect>
            )}
            {/* 当前模型下拉选择器 */}
            {(envConfigRef.current?.ai_config_env?.options_agent_model_list?.length ?? 0) > 0 && (
                <Select
                    value={currentModelName}
                    options={envConfigRef.current.ai_config_env.options_agent_model_list?.map(m => ({ title: m.label, value: m.value })) ?? []}
                    onChange={(value) => {
                        setCurrentModelName(value);
                        ai_agentHttp.post("set_active_model", { model_name: value }).then(() => {
                            NotySuccess('success');
                            settingHttp.get("ai_agent_setting/env").then(res => {
                                if (res.code === RCode.Success) {
                                    envConfigRef.current = res.data;
                                }
                            });
                        }).catch(console.error);
                    }}
                    no_border={true}
                    width={"auto"}
                />
            )}
            {/* 消息批量操作：只在 batchMode 且已选消息时显示删除按钮 */}
            {batchMode && selectedMsgCount > 0 && (
                <ActionButton icon={"delete"} title={t("删除选中消息")} onClick={onBatchDeleteMessages} />
            )}
            <ActionButton
                icon={"terminal"}
                title={t("后台进程")}
                onClick={onToggleBgProcess}
                selected={bgProcessVisible}
            />
            {check_user_auth(UserAuth.ai_agent_setting) && (
                <ActionButton icon={"smart_toy"} title={"机器人配置"} onClick={() => {
                    navigate(`/${routerConfig.ai_rebot_setting_page}`);
                }} />
            )}
            {check_user_auth(UserAuth.ai_agent_setting) && (
                <ActionButton icon={"settings"} title={"ai setting"} onClick={() => {
                    navigate(`/${routerConfig.ai_agent_setting_page}`);
                }} />
            )}
        </Header>
    );
};

export default ChatHeader;
