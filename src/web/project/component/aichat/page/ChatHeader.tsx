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
import { NotySuccess, NotyFail } from "../../../util/noty";
import { RCode } from "../../../../../common/Result.pojo";
import { routerConfig } from "../../../../../common/RouterConfig";
import { ai_agentHttp } from "../../../util/config";
import { $stroe } from "../../../util/store";
import { ai_system_prompt_item } from "../../../../../common/req/filecat.ai.pojo";

/** 一个供应商分组的模型信息（与后端 get_public_models 返回结构一致） */
export interface ModelGroup {
    index: number;
    note: string;
    url: string;
    active: boolean;
    models: { value: string; label: string }[];
}

interface ChatHeaderProps {
    /** 当前模型名称（展示用，值形如 "供应商index::模型值" 或模型名） */
    currentModelName: string;
    /** 设置当前模型名称 */
    setCurrentModelName: (v: string) => void;
    /** 所有供应商聚合的模型分组列表（前端自己构造，来源于后端 public_models） */
    modelGroups: ModelGroup[];
    /** 切换模型成功后回调（用于父组件刷新分组与当前模型） */
    onModelChanged: () => void;
    /** 系统提示词列表 */
    sysPromptList: ai_system_prompt_item[];
    /** 批量模式 */
    batchMode: boolean;
    /** 已选消息数 */
    selectedMsgCount: number;
    /** 切换会话面板 */
    onToggleSessionPanel: () => void;
    /** 创建新会话 */
    onCreateSession: (sysPromptId?: string) => void;
    /** 切换批量模式（消息气泡多选入口） */
    onToggleBatchMode: () => void;
    /** 批量删除消息 */
    onBatchDeleteMessages: () => void;
    /** 后台进程面板是否可见 */
    bgProcessVisible?: boolean;
    /** 所有会话的后台进程总数 */
    bgProcessCount?: number;
    /** 切换后台进程面板 */
    onToggleBgProcess?: () => void;
    /** 当前选中的系统提示词 ID */
    selectedSysPromptId: string;
    /** 设置当前选中的系统提示词 ID */
    setSelectedSysPromptId: (id: string) => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
    currentModelName,
    setCurrentModelName,
    modelGroups,
    onModelChanged,
    sysPromptList,
    batchMode,
    selectedMsgCount,
    onToggleSessionPanel,
    onCreateSession,
    onToggleBatchMode,
    onBatchDeleteMessages,
    bgProcessVisible,
    bgProcessCount,
    onToggleBgProcess,
    selectedSysPromptId,
    setSelectedSysPromptId,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { check_user_auth } = use_auth_check();
    const [, set_ai_session_collapsed] = useAtom($stroe.ai_session_collapsed);

    // 是否允许切换 AI 模型：拥有「允许切换 AI 模型」或「AI 配置」任一权限
    const can_switch_model = check_user_auth(UserAuth.ai_model_switch) || check_user_auth(UserAuth.ai_agent_setting);

    // 把聚合的分组拍平为 Select 的 options，并带上 group 字段以实现分组展示。
    // value 采用 `${供应商index}::${模型值}` 复合键，避免不同供应商存在同名模型时选中态串台。
    const modelOptions: { title: string; value: string; group: string }[] = [];
    for (const g of modelGroups) {
        for (const m of g.models) {
            modelOptions.push({
                title: m.label || m.value,
                value: `${g.index}::${m.value}`,
                group: g.note,
            });
        }
    }

    // 当前选中的复合值：从分组的 active 供应商里找到与 currentModelName 匹配的模型
    const activeGroup = modelGroups.find(g => g.active);
    const selectedModelValue = activeGroup
        ? `${activeGroup.index}::${currentModelName}`
        : "";

    return (
        <Header>
            <ActionButton
                icon={"menu"}
                title={t("会话")}
                onClick={onToggleSessionPanel}
            />
            <ActionButton icon={"add"} title={t("新会话")} onClick={() => onCreateSession()} />
            {sysPromptList.length > 0 && (
                <Select
                    value={selectedSysPromptId}
                    options={[
                        { title: t("选择系统提示词"), value: "" },
                        ...sysPromptList.map((item) => ({
                            title: item.note || item.prompt.slice(0, 30),
                            value: String(item.index)
                        }))
                    ]}
                    onChange={(value) => {
                        setSelectedSysPromptId(value);
                    }}
                    no_border={true}
                    width={"auto"}
                />
            )}
            {/* 当前模型下拉选择器（聚合所有供应商的模型，按供应商分组） */}
            {can_switch_model && modelOptions.length > 0 && (
                <Select
                    value={selectedModelValue}
                    // 顶部占位项：当前没有任何激活模型时显示「选择模型」提示
                    options={[{ title: t("选择模型"), value: "" }, ...modelOptions]}
                    margin={"0 0 0 1em"}
                    onChange={(value) => {
                        // value 形如 `${供应商index}::${模型值}`；空值（占位项「选择模型」）不处理
                        const valStr = String(value ?? "");
                        if (!valStr.includes("::")) return;
                        const [idxStr, ...rest] = valStr.split("::");
                        const modelName = rest.join("::");
                        if (!modelName) return;
                        setCurrentModelName(modelName);
                        ai_agentHttp.post("set_active_model", { index: Number(idxStr), model_name: modelName }).then((res: any) => {
                            if (res?.code === RCode.Success) {
                                NotySuccess('success');
                                onModelChanged();
                            } else {
                                NotyFail(res?.message || 'fail');
                            }
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
                tip={bgProcessCount?bgProcessCount:null}
            />
            {check_user_auth(UserAuth.ai_agent_setting) && (
                <ActionButton icon={"smart_toy"} title={"机器人配置"} onClick={() => {
                    navigate(routerConfig.ai_rebot_setting_page);
                }} />
            )}
            {check_user_auth(UserAuth.ai_agent_setting) && (
                <ActionButton icon={"settings"} title={"ai setting"} onClick={() => {
                    navigate(routerConfig.ai_agent_setting_page);
                }} />
            )}
        </Header>
    );
};

export default ChatHeader;
