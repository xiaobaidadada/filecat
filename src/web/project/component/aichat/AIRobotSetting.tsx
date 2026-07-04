import {useTranslation} from "react-i18next";
import React, {useEffect, useState} from "react";
import Switch, {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {InputText, Select} from "../../../meta/component/Input";
import {Card, StatusCircle} from "../../../meta/component/Card";
import {settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySuccess} from "../../util/noty";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {useNavigate} from "react-router-dom";
import {ai_rebot_item, ai_rebot_setting} from "../../../../common/req/filecat.ai.pojo";
import {using_env_prompt} from "../setting/util";

/* ---------- 平台元信息 ---------- */
interface PlatformMeta {
    key: string;          // 对应 ai_rebot_item.platform
    label: string;        // 显示名称
    icon: string;         // material icon
    color: string;        // 卡片顶部色条
    fields: PlatformField[];
}

interface PlatformField {
    key: string;          // ai_rebot_item 上的字段名
    label: string;
    type: 'text' | 'password' | 'textarea';
    placeholder?: string;
    required?: boolean;
}

export const PLATFORM_META: Record<string, PlatformMeta> = {
    qq: {
        key: 'qq',
        label: 'QQ 机器人',
        icon: 'QQ',
        color: '#12B7F5',
        fields: [
            { key: 'appId', label: 'AppId', type: 'text', placeholder: '请输入机器人 AppId', required: true },
            { key: 'clientSecret', label: '密钥', type: 'password', placeholder: '请输入机器人密钥', required: true },
        ],
    },
    dingtalk: {
        key: 'dingtalk',
        label: '钉钉机器人',
        icon: '钉钉',
        color: '#0089FF',
        fields: [
            { key: 'appId', label: 'ClientId (AppKey)', type: 'text', placeholder: '请输入应用 ClientId', required: true },
            { key: 'clientSecret', label: 'ClientSecret (AppSecret)', type: 'password', placeholder: '请输入应用 ClientSecret', required: true },
        ],
    },
    wecom: {
        key: 'wecom',
        label: '企业微信机器人',
        icon: '企业微信',
        color: '#07C160',
        fields: [
            { key: 'appId', label: 'botId', type: 'text', placeholder: '请输入机器人 botId', required: true },
            { key: 'clientSecret', label: 'Secret', type: 'password', placeholder: '请输入机器人 Secret', required: true },
        ],
    },
    lark: {
        key: 'lark',
        label: '飞书机器人',
        icon: '飞书',
        color: '#3370FF',
        fields: [
            { key: 'appId', label: 'App ID', type: 'text', placeholder: '请输入应用 App ID', required: true },
            { key: 'clientSecret', label: 'App Secret', type: 'password', placeholder: '请输入应用 App Secret', required: true },
        ],
    },
};

// 默认平台 key（添加卡片时的默认选择）
const DEFAULT_PLATFORM = 'qq';

const PLATFORM_SELECT_OPTIONS = Object.entries(PLATFORM_META).map(([key, meta]) => ({
    value: key,
    title: meta.label,
    color: meta.color,
}));

/* ---------- 可复用的机器人卡片容器组件 ---------- */
export interface RebotCardItem {
    name: string;
    platform: string;
    open: boolean;
    [key: string]: any;
}

export function RebotCardContainer(props: {
    items: RebotCardItem[];
    setItems: (items: RebotCardItem[]) => void;
    save: () => Promise<void>;
    have_auth_edit?: boolean;
}) {
    const { t } = useTranslation();
    const [showAddSelect, setShowAddSelect] = useState(false);
    const [saving, setSaving] = useState(false);

    const updateItem = (idx: number, patch: Partial<RebotCardItem>) => {
        const next = [...props.items];
        next[idx] = { ...next[idx], ...patch };
        props.setItems(next);
    };

    const del = (index: number) => {
        const next = [...props.items];
        next.splice(index, 1);
        props.setItems(next);
    };

    const copy = (index: number) => {
        props.setItems([...props.items, { ...props.items[index], open: false, name: (props.items[index].name || '') + ' (副本)' }]);
    };

    const add = (platformKey: string) => {
        props.setItems([...props.items, {
            platform: platformKey,
            name: '',
            open: false,
            appId: '',
            clientSecret: '',
            note: '',
        }]);
        setShowAddSelect(false);
    };

    const handleSave = async () => {
        setSaving(true);
        await props.save();
        setSaving(false);
    };

    return (
        <React.Fragment>
            <div className="airebot-setting__toolbar">
                {props.have_auth_edit !== false && (
                    <>
                        {showAddSelect ? (
                            <div className="airebot-setting__add-select">
                                <Select
                                    options={PLATFORM_SELECT_OPTIONS}
                                    defaultValue={DEFAULT_PLATFORM}
                                    onChange={(v) => add(v)}
                                    width="180px"
                                />
                                <ActionButton icon={"cancel"} title={t("取消")} onClick={() => setShowAddSelect(false)} />
                            </div>
                        ) : (
                            <ActionButton icon={"add"} title={t("添加机器人")} onClick={() => setShowAddSelect(true)} />
                        )}
                        <ActionButton
                            icon={"save"}
                            title={saving ? t("保存中...") : t("保存")}
                            onClick={() => { if (!saving) handleSave(); }}
                        />
                    </>
                )}
            </div>

            {props.items.length === 0 ? (
                <div className="airebot-setting__empty">
                    <span className="material-symbols-outlined airebot-setting__empty-icon">
                        smart_toy
                    </span>
                    <p>{t("还没有配置任何机器人")}</p>
                    <p className="airebot-setting__empty-hint">{t("点击上方「添加机器人」按钮来开始配置")}</p>
                </div>
            ) : (
                <div className="airebot-setting__grid">
                    {props.items.map((item, index) => (
                        <RebotCard
                            key={index}
                            item={item}
                            index={index}
                            onChange={updateItem}
                            onDelete={del}
                            onCopy={copy}
                        />
                    ))}
                </div>
            )}
        </React.Fragment>
    );
}

/* ---------- 单个机器人卡片 ---------- */
export const RebotCard: React.FC<{
    item: RebotCardItem;
    index: number;
    onChange: (idx: number, patch: Partial<RebotCardItem>) => void;
    onDelete: (idx: number) => void;
    onCopy: (idx: number) => void;
}> = ({ item, index, onChange, onDelete, onCopy }) => {
    const { t } = useTranslation();
    const meta = PLATFORM_META[item.platform] ?? PLATFORM_META[DEFAULT_PLATFORM];

    const statusKey = item._status || 'disconnected';
    const effectiveStatus = item.open ? statusKey : 'disconnected';

    return (
        <Card
            self_title={
                <div className="airebot-setting__card-header">
                    <span className="material-symbols-outlined airebot-setting__card-icon" style={{ color: meta.color }}>
                        {meta.icon}
                    </span>
                </div>
            }
            titleCom={
                <div className="airebot-setting__card-actions">
                    <Switch
                        checked={!!item.open}
                        onChange={(v) => onChange(index, { open: v })}
                    />
                    <ActionButton icon={"content_copy"} title={t("复制")} onClick={() => onCopy(index)} />
                    <ActionButton icon={"delete"} title={t("删除")} onClick={() => onDelete(index)} />
                </div>
            }
        >
            <div className="airebot-setting__card-fields">
                {/* 平台选择 */}
                <div className="airebot-setting__field">
                    <label className="airebot-setting__field-label">
                        {t("平台")}
                    </label>
                    <Select
                        options={PLATFORM_SELECT_OPTIONS}
                        value={item.platform}
                        onChange={(v) => onChange(index, { platform: v })}
                        width="100%"
                    />
                </div>

                {/* 备注名称 */}
                <div className="airebot-setting__field">
                    <label className="airebot-setting__field-label">
                        {t("名称")}
                    </label>
                    <InputText
                        value={item.name || ''}
                        handleInputChange={(v) => onChange(index, { name: v })}
                        placeholder={t("给机器人起个名字")}
                    />
                </div>

                {/* 平台特有字段 */}
                {meta.fields.map((field) => {
                    const value = (item as any)[field.key] ?? '';
                    return (
                        <div key={field.key} className="airebot-setting__field">
                            <label className="airebot-setting__field-label">
                                {field.label}
                                {field.required && <span className="airebot-setting__field-required">*</span>}
                            </label>
                            <InputText
                                type={field.type}
                                value={value}
                                handleInputChange={(v) => onChange(index, { [field.key]: v } as any)}
                                placeholder={field.placeholder}
                            />
                        </div>
                    );
                })}

                {/* 模型 index */}
                <div className="airebot-setting__field ">
                    <label className="airebot-setting__field-label">
                        {t("模型编号")}
                    </label>
                    <InputText
                        value={item.model_index}
                        handleInputChange={(v) => onChange(index, { model_index: v })}
                        placeholder={t("使用指定模型（可选）")}
                    />
                </div>

                {/* 用户id */}
                <div className="airebot-setting__field ">
                    <label className="airebot-setting__field-label">
                        {t("用户id")}
                    </label>
                    <InputText
                        value={item.user_id || ''}
                        handleInputChange={(v) => onChange(index, { user_id: v })}
                        placeholder={t("默认使用root账户（继承权限，可选）")}
                    />
                </div>

                {/* 备注 */}
                <div className="airebot-setting__field airebot-setting__field-full">
                    <label className="airebot-setting__field-label">
                        {t("备注")}
                    </label>
                    <InputText
                        value={item.note || ''}
                        handleInputChange={(v) => onChange(index, { note: v })}
                        placeholder={t("备注信息（可选）")}
                    />
                </div>


            </div>
        </Card>
    );
};

/* ---------- 主页面 ---------- */
export default function AIRobotSetting() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { check_user_auth } = use_auth_check();

    const [rows, setRows] = useState<ai_rebot_item[]>([]);
    const soft_ware_info_click = using_env_prompt();

    const getItems = async () => {
        const result = await settingHttp.get("ai_rebot_setting");
        if (result.code === RCode.Success) {
            setRows(result.data?.list ?? []);
        }
    };

    useEffect(() => {
        getItems();
    }, []);

    const save = async () => {
        const list = rows.map((item, i) => ({ ...item, index: i }));
        const data: ai_rebot_setting = { list };
        const result = await settingHttp.post("ai_rebot_setting/save", data);
        if (result.code === RCode.Success) {
            NotySuccess(t("保存成功"));
            await getItems();
        }
    };

    return (
        <div className="airebot-setting">
            <Header>
                {check_user_auth(UserAuth.ai_agent_setting) &&
                    <ActionButton icon={"arrow_back"} title={t("上一页")} onClick={() => navigate(-1)} />
                }
            </Header>

            <Row>
                <Column widthPer={100}>
                    <div className="airebot-setting__page-title">
                        <h2>{t("机器人配置")}</h2>
                        <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click("机器人配置")}} title={"信息"}/>
                    </div>

                    <RebotCardContainer
                        items={rows}
                        setItems={setRows}
                        save={save}
                        have_auth_edit={check_user_auth(UserAuth.ai_agent_setting)}
                    />
                </Column>
            </Row>
        </div>
    );
}
