import React, {useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {ActionButton} from "../../../../../meta/component/Button";
import {InputText} from "../../../../../meta/component/Input";

export interface GitUserConfig {
    name: string;
    email: string;
}

export interface GitProxyConfig {
    global: { http: string; https: string };
    local: { http: string; https: string };
}

interface Props {
    dir_path: string;
    user_config: GitUserConfig;
    proxy_config: GitProxyConfig | null;
    on_user_config_saved: (config: GitUserConfig) => void;
    on_proxy_saved: (config: GitProxyConfig) => void;
}

/**
 * Git 用户信息与代理配置面板。
 * 平时只显示当前值，点编辑切换为输入框。
 */
export default function GitConfigPanel(props: Props) {
    const {t} = useTranslation();
    const {dir_path, user_config, proxy_config} = props;

    const [config_editing, setConfigEditing] = useState(false);
    const [edit_name, setEditName] = useState(user_config.name);
    const [edit_email, setEditEmail] = useState(user_config.email);

    const [proxy_editing, setProxyEditing] = useState(false);
    const [edit_g_http, setEditGHttp] = useState(proxy_config?.global.http || '');
    const [edit_g_https, setEditGHttps] = useState(proxy_config?.global.https || '');
    const [edit_l_http, setEditLHttp] = useState(proxy_config?.local.http || '');
    const [edit_l_https, setEditLHttps] = useState(proxy_config?.local.https || '');

    const start_edit_config = () => {
        setEditName(user_config.name);
        setEditEmail(user_config.email);
        setConfigEditing(true);
    };

    const save_user_config = async () => {
        try {
            const rsq = await gitHttp.post('set_user_config', {path: dir_path, name: edit_name, email: edit_email});
            if (rsq.code === 0) {
                NotySuccess(t('用户配置已保存'));
                setConfigEditing(false);
                props.on_user_config_saved({name: edit_name, email: edit_email});
            } else NotyFail(rsq.message);
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const start_edit_proxy = () => {
        setEditGHttp(proxy_config?.global.http || '');
        setEditGHttps(proxy_config?.global.https || '');
        setEditLHttp(proxy_config?.local.http || '');
        setEditLHttps(proxy_config?.local.https || '');
        setProxyEditing(true);
    };

    const save_proxy = async () => {
        const items = [
            {scope: 'global', type: 'http', value: edit_g_http},
            {scope: 'global', type: 'https', value: edit_g_https},
            {scope: 'local', type: 'http', value: edit_l_http},
            {scope: 'local', type: 'https', value: edit_l_https},
        ];
        try {
            for (const item of items) {
                await gitHttp.post('set_proxy', {path: dir_path, ...item});
            }
            NotySuccess(t('代理配置已保存'));
            setProxyEditing(false);
            props.on_proxy_saved({
                global: {http: edit_g_http, https: edit_g_https},
                local: {http: edit_l_http, https: edit_l_https},
            });
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const proxy_summary = () => {
        if (!proxy_config) return '-';
        const g = proxy_config.global;
        if (g.http || g.https) return `global ${g.http || g.https}`;
        const l = proxy_config.local;
        if (l.http || l.https) return `local ${l.http || l.https}`;
        return '-';
    };

    return (
        <>
            <div className="git-config-row">
                <span className="git-config__label">{t('用户配置')}</span>
                {!config_editing ? (
                    <>
                        <span className="git-config__value">
                            {user_config.name} / {user_config.email}
                        </span>
                        <ActionButton icon={"edit"} title={t('编辑')} onClick={start_edit_config}/>
                    </>
                ) : (
                    <>
                        <InputText maxWidth={"15rem"} value={edit_name} placeholder={"user.name"}
                                   handleInputChange={(v: string) => setEditName(v)}/>
                        <InputText maxWidth={"15rem"} value={edit_email} placeholder={"user.email"}
                                   handleInputChange={(v: string) => setEditEmail(v)}/>
                        <ActionButton icon={"check"} title={t('保存')} onClick={save_user_config}/>
                        <ActionButton icon={"close"} title={t('取消')} onClick={() => setConfigEditing(false)}/>
                    </>
                )}
            </div>
            <div className="git-config-row">
                <span className="git-config__label">{t('代理配置')}</span>
                {!proxy_editing ? (
                    <>
                        <span className="git-config__value">{proxy_summary()}</span>
                        <ActionButton icon={"edit"} title={t('编辑')} onClick={start_edit_proxy}/>
                    </>
                ) : (
                    <>
                        <InputText  maxWidth={"15rem"} value={edit_g_http} placeholder={"global http"}
                                   handleInputChange={(v: string) => setEditGHttp(v)}/>
                        <InputText maxWidth={"15rem"}  value={edit_g_https} placeholder={"global https"}
                                   handleInputChange={(v: string) => setEditGHttps(v)}/>
                        <InputText maxWidth={"15rem"}  value={edit_l_http} placeholder={"local http"}
                                   handleInputChange={(v: string) => setEditLHttp(v)}/>
                        <InputText maxWidth={"15rem"}  value={edit_l_https} placeholder={"local https"}
                                   handleInputChange={(v: string) => setEditLHttps(v)}/>
                        <ActionButton icon={"check"} title={t('保存')} onClick={save_proxy}/>
                        <ActionButton icon={"close"} title={t('取消')} onClick={() => setProxyEditing(false)}/>
                    </>
                )}
            </div>
        </>
    );
}
