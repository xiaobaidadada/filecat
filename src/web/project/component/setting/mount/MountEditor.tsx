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
    credential_options,
    account_options,
    need_account_of,
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
    const show_tip = using_tip();
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
        forward_to_remote: false,
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
                        // 位置是「可远程列出」的类型时，打开表单就得把可选列表拉好，
                        // 否则下拉里是空的，用户只能看到已存的那个值却换不了
                        if (item.credential_id) {
                            void fetch_locations(item.credential_id, item.driver, item.account_id);
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }
        })();
    }, []);

    /** 当前驱动元信息 */
    const meta = drivers.find(d => d.type === row.driver);
    /** 位置是「可远程列出」的形式（SMB 共享名、S3 存储桶 + 前缀） */
    const use_location_list = meta?.location === "share";
    /** 位置从凭据里的「名称 → 路径」映射中挑（本地目录） */
    const use_local_source = meta?.location === "local";
    /** 当前凭据登记的本地源目录映射 */
    const local_sources: {name: string; path: string}[] = (() => {
        const cfg = creds.find(c => c.id === row.credential_id)?.config;
        return Array.isArray(cfg?.sources) ? cfg.sources : [];
    })();
    const local_options = local_sources.map(v => ({title: `${v.name}（${v.path}）`, value: v.name}));
    /** 位置第一段（共享名 / 桶名），与 row.root_dir 的第一段同步 */
    const location_name = String(row.root_dir ?? "").split("/")[0] ?? "";
    /** 位置第二段（共享内子路径 / Key 前缀） */
    const location_sub = String(row.root_dir ?? "").split("/").slice(1).join("/");

    /** 拼回 root_dir：name 为空表示整个位置，sub 为空表示位置根 */
    const make_root_dir = (name: string, sub: string) => {
        const n = name.trim();
        const b = sub.trim().replace(/^\/+|\/+$/g, "");
        if (!n) {
            return "";
        }
        return b ? `${n}/${b}` : n;
    };

    /** 远程可列出的位置（SMB 共享名 / S3 存储桶） */
    const [locations, set_locations] = useState<{title: string; value: string}[]>([]);
    const [loading_locations, set_loading_locations] = useState(false);

    /** 拉取远程可选位置；credential / driver 传入时用它们（打开表单时 row 还没更新） */
    const fetch_locations = async (credential?: string, driver_type?: string, acc_id?: string) => {
        const cred_id = credential ?? row.credential_id;
        if (!cred_id) {
            return;
        }
        const acc = acc_id ?? row.account_id;
        // 账号还没选就先不拉目录，避免直接报错
        if (need_account_of(cred_id, creds) && !acc) {
            set_locations([]);
            return;
        }
        set_loading_locations(true);
        try {
            const rsq = await mountHttp.post("share/list", {
                driver: driver_type ?? row.driver,
                config: creds.find(c => c.id === cred_id)?.config ?? {},
                id: cred_id,
                account_id: acc,
            });
            const list = Array.isArray(rsq?.data) ? rsq.data : [];
            set_locations(list.map((v: any) => ({
                title: v.remark ? `${v.name}（${v.remark}）` : v.name,
                value: v.name,
            })));
        } catch (e) {
            // Http 层已提示；保持空列表让用户可手填
            set_locations([]);
        } finally {
            set_loading_locations(false);
        }
    };

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
                options={drivers.map(d => ({title: d.name, value: d.type}))}
                onChange={(v) => {
                    set_row({...row, driver: v, credential_id: "", account_id: "", root_dir: ""});
                    set_locations([]);
                }}/>
        <Select value={row.credential_id} options={cred_options()}
                placeholder={t("选择凭据")}
                onChange={async (v) => {
                    set_row({...row, credential_id: v, account_id: ""});
                    // 换凭据后位置列表要重拉：不同账号能看到的共享/桶不同
                    set_locations([]);
                    if (v) {
                        await fetch_locations();
                    }
                }}/>
        {/* 只有「一凭据多账号」的凭据（百度、内网穿透）才需要再选具体账号 */}
        {need_account && <Select value={row.account_id} options={cur_account_options}
                placeholder={t("选择账号")}
                onChange={async (v) => {
                    set_row({...row, account_id: v, root_dir: ""});
                    set_locations([]);
                    if (v) {
                        await fetch_locations(row.credential_id, row.driver, v);
                    }
                }}/>}
        {/* 位置：优先用下拉里列出的共享名/存储桶；SMB 拿不到共享列表时可在下面直接填 */}
        {use_location_list && <>
            <Select value={location_name} options={locations}
                    placeholder={loading_locations
                        ? t("加载中")
                        : (meta?.location_label === "s3_bucket" ? t("选择存储桶") : t("选择共享目录"))}
                    onChange={(v) => set_row({...row, root_dir: make_root_dir(v, location_sub)})}/>
            <InputText value={location_sub}
                       placeholder={meta?.location_label === "s3_bucket" ? t("前缀（可留空）") : t("子路径（可留空）")}
                       handleInputChange={(v) => set_row({...row, root_dir: make_root_dir(location_name, v)})}/>
            {/* SMB 有时列不出共享列表，这里允许直接填共享名，填了就优先用它 */}
            {row.driver === "smb" && <InputText value={location_name}
                       placeholder={t("或直接输入共享名")}
                       handleInputChange={(v) => set_row({...row, root_dir: make_root_dir(v, location_sub)})}/>}
        </>}
        {use_local_source && <Select value={row.root_dir} options={local_options}
                placeholder={t("选择源目录")}
                onChange={(v) => set_row({...row, root_dir: v})}/>}
        {!use_location_list && !use_local_source && <RemotePathPicker driver={row.driver}
                credential_id={row.credential_id}
                account_id={row.account_id}
                require_account={need_account}
                config={creds.find(c => c.id === row.credential_id)?.config ?? {}}
                value={row.root_dir} onChange={(v) => set_row({...row, root_dir: v})}/>}
        <InputText placeholder={t("备注")} value={row.note}
                   handleInputChange={(v) => set_row({...row, note: v})}/>
        <InputText placeholder={t("标识色，如 #4a9eff")} value={row.color}
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
