import React, {useEffect, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {useTranslation} from "react-i18next";
import {ButtonLittle, ButtonText} from "../../../../meta/component/Button";
import {mountHttp} from "../../../util/config";
import {using_tip} from "../../prompts/prompts.util";
import {NotyFail, NotySuccess} from "../../../util/noty";
import MountForm, {empty_mount_form, MountFormValue} from "./MountForm";
import {CredentialRow, DEFAULT_COLOR} from "./mount_common";

interface Props {
    /** 要挂载的本地目录绝对路径 */
    mount_path: string;
    /** 编辑已有挂载时传入 */
    mount_id?: string;
    onClose: () => void;
    /** 保存成功后的回调 */
    onDone: () => void;
}

/**
 * 目录挂载配置弹框（纯内容组件，由全局 set_prompt_card 承载）。
 *
 * 只做「引用」：选驱动类型 + 选一份凭据 + 填起始目录。
 * 凭据都来自「设置 → 网盘挂载 → 凭证管理」。
 */
export default function MountEditor(props: Props) {
    const {t} = useTranslation();
    const show_tip = using_tip();
    const [creds, set_creds] = useState<CredentialRow[]>([]);
    const [form, set_form] = useState<MountFormValue>(empty_mount_form());

    useEffect(() => {
        (async () => {
            try {
                const c = await mountHttp.post("credential/list", {});
                set_creds(Array.isArray(c?.data) ? c.data : []);
            } catch (e) {
                // Http 层已提示
            }
            if (props.mount_id) {
                try {
                    const rsq = await mountHttp.post("list", {});
                    const item = (Array.isArray(rsq?.data) ? rsq.data : [])
                        .find((v: any) => v.id === props.mount_id);
                    if (item) {
                        set_form({
                            driver: item.driver,
                            mount_path: item.mount_path ?? "",
                            credential_id: item.credential_id ?? "",
                            account_id: item.account_id ?? "",
                            root_dir: item.root_dir ?? "",
                            note: item.note ?? "",
            color: item.color ?? DEFAULT_COLOR,
                            readonly: Boolean(item.readonly),
                            forward_to_remote: Boolean(item.forward_to_remote),
                        });
                    }
                } catch (e) {
                    // ignore
                }
            }
        })();
    }, []);

    const do_test = async () => {
        if (!form.credential_id) {
            NotyFail(t("请选择凭据"));
            return;
        }
        try {
            const rsq = await mountHttp.post("test", {
                id: props.mount_id,
                driver: form.driver,
                credential_id: form.credential_id,
                account_id: form.account_id,
                root_dir: form.root_dir,
            });
            const r = rsq?.data;
            if (r?.ok) {
                NotySuccess(`${t("连接成功")}（${r.count ?? 0}）`);
            } else {
                NotyFail(`${t("连接失败")}：${r?.error ?? ""}`);
            }
        } catch (e) {
            // Http 层已提示
        }
    };

    const save = async () => {
        if (!form.credential_id) {
            NotyFail(t("请选择凭据"));
            return;
        }
        // 账号留空表示匿名访问（SMB/WebDAV 服务端免密），允许保存
        try {
            await mountHttp.post(props.mount_id ? "update" : "add", {
                id: props.mount_id,
                driver: form.driver,
                mount_path: props.mount_path,
                credential_id: form.credential_id,
                account_id: form.account_id || undefined,
                root_dir: form.root_dir,
                note: form.note,
                color: form.color,
                readonly: form.readonly,
                enabled: true,
                // 非内网穿透驱动不支持转发，切走时显式置 false，避免残留脏值
                forward_to_remote: form.driver === "tcp_proxy" && Boolean(form.forward_to_remote),
            });
            NotySuccess(t("保存成功"));
            props.onDone();
        } catch (e) {
            // Http 层已提示
        }
    };

    /**
     * 底部按钮交给 PromptCard 统一渲染（bottom_div），弹框自身不再画一条按钮栏。
     * 挂载后注入一次；依赖为空，回调里读到的始终是本次渲染的闭包。
     */
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);
    useEffect(() => {
        set_prompt_card({
            ...prompt_card,
            bottom_div: <>
                <ButtonText text={t("取消")} clickFun={props.onClose}/>
                <ButtonText text={t("测试连接")} clickFun={do_test}/>
                <ButtonLittle text={t("保存")} clickFun={save}/>
            </>
        });
    }, [form, creds]);

    return (<>
        <p>{props.mount_path}</p>
        <MountForm value={form} onChange={set_form} creds={creds} edit_mount_path={false}/>
    </>);
}
