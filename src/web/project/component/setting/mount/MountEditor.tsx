import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {InputText, Select} from "../../../../meta/component/Input";
import {ActionButton} from "../../../../meta/component/Button";
import {mountHttp} from "../../../util/config";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {
    CredentialRow,
    credential_options,
    account_options,
    DEFAULT_COLOR,
    DriverMeta,
} from "./mount_common";

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
    const [drivers, set_drivers] = useState<DriverMeta[]>([]);
    const [creds, set_creds] = useState<CredentialRow[]>([]);
    const [row, set_row] = useState<any>({
        driver: "webdav",
        credential_id: "",
        account_id: "",
        root_dir: "",
        note: "",
        color: DEFAULT_COLOR,
        readonly: false,
        enabled: true,
    });

    useEffect(() => {
        (async () => {
            try {
                const [d, c] = await Promise.all([
                    mountHttp.post("driver/list", {}),
                    mountHttp.post("credential/list", {}),
                ]);
                set_drivers(Array.isArray(d?.data) ? d.data : []);
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
                        set_row({
                            driver: item.driver ?? "webdav",
                            credential_id: item.credential_id ?? "",
                            account_id: item.account_id ?? "",
                            root_dir: item.root_dir ?? "",
                            note: item.note ?? "",
                            color: item.color ?? DEFAULT_COLOR,
                            readonly: Boolean(item.readonly),
                            enabled: item.enabled !== false,
                        });
                    }
                } catch (e) {
                    // ignore
                }
            }
        })();
    }, []);

    /** 当前驱动类型可选的凭据来源 */
    const cred_options = () => credential_options(row.driver, creds);

    /** 当前凭据是否需要再选账号（只有「一个应用多账号」的凭据才有 accounts） */
    const cur_account_options = account_options(row.credential_id, creds);
    const need_account = cur_account_options.length > 0;

    const do_test = async () => {
        if (!row.credential_id) {
            NotyFail(t("请选择凭据"));
            return;
        }
        try {
            const rsq = await mountHttp.post("test", {
                id: props.mount_id,
                driver: row.driver,
                credential_id: row.credential_id,
                account_id: row.account_id,
                root_dir: row.root_dir,
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
        if (!row.credential_id) {
            NotyFail(t("请选择凭据"));
            return;
        }
        if (need_account && !row.account_id) {
            NotyFail(t("请选择账号"));
            return;
        }
        try {
            await mountHttp.post(props.mount_id ? "update" : "add", {
                id: props.mount_id,
                driver: row.driver,
                mount_path: props.mount_path,
                credential_id: row.credential_id,
                account_id: need_account ? row.account_id : undefined,
                root_dir: row.root_dir,
                note: row.note,
                color: row.color,
                readonly: row.readonly,
                enabled: row.enabled,
            });
            NotySuccess(t("保存成功"));
            props.onDone();
        } catch (e) {
            // Http 层已提示
        }
    };

    return (<>
        <p>{props.mount_path}</p>
        <Select value={row.driver}
                options={drivers.map(d => ({title: d.name, value: d.type}))}
                onChange={(v) => set_row({...row, driver: v, credential_id: "", account_id: ""})}/>
        <Select value={row.credential_id} options={cred_options()}
                onChange={(v) => set_row({...row, credential_id: v, account_id: ""})}/>
        {/* 只有「一个应用多账号」的凭据（百度）才需要再选具体账号 */}
        {need_account && <Select value={row.account_id} options={cur_account_options}
                onChange={(v) => set_row({...row, account_id: v})}/>}
        <InputText placeholder={t("strtdrt")} value={row.root_dir}
                   handleInputChange={(v) => set_row({...row, root_dir: v})}/>
        <InputText placeholder={t("备注")} value={row.note}
                   handleInputChange={(v) => set_row({...row, note: v})}/>
        <InputText placeholder={t("标识色，如 #4a9eff")} value={row.color}
                   handleInputChange={(v) => set_row({...row, color: v})}/>
        <Select value={row.readonly}
                options={[{title: t("只读"), value: true}, {title: "读写", value: false}]}
                onChange={(v) => set_row({...row, readonly: v})}/>
        <div>
            <ActionButton icon={"cancel"} title={t("取消")} onClick={props.onClose}/>
            <ActionButton icon={"network_check"} title={t("测试连接")} onClick={do_test}/>
            <ActionButton icon={"save"} title={t("保存")} onClick={save}/>
        </div>
    </>);
}
