import RemotePathPicker from "./RemotePathPicker";
import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {InputText, Select} from "../../../../meta/component/Input";
import {ActionButton, ButtonLittle, ButtonText} from "../../../../meta/component/Button";
import Switch from "../../../../meta/component/Button";import {mountHttp} from "../../../util/config";
import {using_tip} from "../../prompts/prompts.util";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {
    CredentialRow,
    LocalSourceRow,
    credential_options,
    account_options,
    need_account_of,
    DEFAULT_COLOR,
    DRIVER_META_LIST,
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
    const show_tip = using_tip();
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
        forward_to_remote: false,
    });

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
                        set_row({
                            driver: item.driver ,
                            credential_id: item.credential_id ?? "",
                            account_id: item.account_id ?? "",
                            root_dir: item.root_dir ?? "",
                            note: item.note ?? "",
                            color: item.color ?? DEFAULT_COLOR,
                            readonly: Boolean(item.readonly),
                            enabled: item.enabled !== false,
                            forward_to_remote: Boolean(item.forward_to_remote),
                        });
                    }
                } catch (e) {
                    // ignore
                }
            }
        })();
    }, []);

    /** 当前驱动元信息 */
    const meta = DRIVER_META_LIST.find(d => d.type === row.driver);
    /** 位置是「可远程列出」的形式（SMB 共享名、S3 存储桶 + 前缀） */
    const use_location_list = meta?.location === "share";
    /** 位置从凭据里的「名称 → 路径」映射中挑（本地目录） */
    const use_local_source = meta?.location === "local";
    /** 当前凭据登记的本地源目录映射 */
    const local_sources: LocalSourceRow[] = creds.find(c => c.id === row.credential_id)?.local_sources ?? [];
    const local_options = local_sources.map(v => ({title: `${v.name}（${v.path}）`, value: v.name}));

    /** 当前驱动类型可选的凭据来源 */
    const cred_options = () => credential_options(row.driver, creds);

    /** 当前凭据是否需要再选账号（只有「一凭据多账号」的凭据才有 accounts） */
    const cur_account_options = account_options(row.credential_id, creds);
    const need_account = need_account_of(row.credential_id, creds);

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
        // 账号留空表示匿名访问（SMB/WebDAV 服务端免密），允许保存
        try {
            await mountHttp.post(props.mount_id ? "update" : "add", {
                id: props.mount_id,
                driver: row.driver,
                mount_path: props.mount_path,
                credential_id: row.credential_id,
                account_id: row.account_id || undefined,
                root_dir: row.root_dir,
                note: row.note,
                color: row.color,
                readonly: row.readonly,
                enabled: row.enabled,
                // 非内网穿透驱动不支持转发，切走时显式置 false，避免残留脏值
                forward_to_remote: row.driver === "tcp_proxy" && Boolean(row.forward_to_remote),
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
                options={DRIVER_META_LIST.map(d => ({title: d.name, value: d.type}))}
                onChange={(v) => {
                    set_row({...row, driver: v, credential_id: "", account_id: "", root_dir: ""});
                }}/>
        <Select value={row.credential_id} options={cred_options()}
                placeholder={t("选择凭据")}
                onChange={(v) => {
                    set_row({...row, credential_id: v, account_id: ""});
                }}/>
        {/* 有账号的凭据才需要选具体账号；留空即匿名访问 */}
        {need_account && <Select value={row.account_id} options={cur_account_options}
                placeholder={t("选择账号")}
                onChange={(v) => {
                    set_row({...row, account_id: v, root_dir: ""});
                }}/>}
        {/* 位置：所有驱动都同时支持「列表/目录树挑选」和「直接手填」 */}
        {use_location_list && <RemotePathPicker driver={row.driver}
                credential_id={row.credential_id}
                account_id={row.account_id}
                require_account={need_account} editable
                value={row.root_dir ?? ""} onChange={(v) => set_row({...row, root_dir: v})}/>}
        {use_local_source && <>
            <Select value={row.root_dir} options={local_options}
                    placeholder={t("选择源目录")}
                    onChange={(v) => set_row({...row, root_dir: v})}/>
            <InputText value={String(row.root_dir ?? "")} placeholder={t("src_dir_ph")}
                       handleInputChange={(v) => set_row({...row, root_dir: String(v ?? "").trim()})}/>
        </>}
        {!use_location_list && !use_local_source && <RemotePathPicker driver={row.driver}
                credential_id={row.credential_id}
                account_id={row.account_id}
                require_account={need_account} editable
                editable_placeholder={row.driver === "sftp"
                    ? t("sftp_path_ph")
                    : undefined}
                value={row.root_dir ?? ""} onChange={(v) => set_row({...row, root_dir: v})}/>}
        <InputText placeholder={t("备注")} value={row.note}
                   handleInputChange={(v) => set_row({...row, note: v})}/>
        {/* 标识色：InputText 内部已含色块 + 色值，不用再套容器 */}
        <InputText type={"color"} value={row.color || DEFAULT_COLOR}
                   handleInputChange={(v) => set_row({...row, color: v})}/>
        <Select value={row.readonly}
                options={[{title: t("只读"), value: true}, {title: "读写", value: false}]}
                onChange={(v) => set_row({...row, readonly: v})}/>
        {/* 只有内网穿透挂载能转发：其它驱动的对端不是 FileCat，没有它自己的前端和终端 */}
        {row.driver === "tcp_proxy" && <div className={"div-row"}>
            <span>{t("ftr2rmt")}</span>
            <Switch checked={Boolean(row.forward_to_remote)}
                    onChange={(v) => set_row({...row, forward_to_remote: v})}
                    title={t("ftr2rmt_tip")}/>

        </div>}
        <div className={"div-row div-row--end"}>
            <ButtonText text={t("取消")} clickFun={props.onClose}/>
            <ButtonText text={t("测试连接")} clickFun={do_test}/>
            <ButtonLittle text={t("保存")} clickFun={save}/>
        </div>
    </>);
}
