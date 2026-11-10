import RemotePathPicker from "./RemotePathPicker";
import React from "react";
import {useTranslation} from "react-i18next";
import {InputRow, InputText, Select} from "../../../../meta/component/Input";
import Switch from "../../../../meta/component/Button";
import {
    CredentialRow,
    LocalSourceRow,
    account_options,
    credential_options,
    need_account_of,
    DRIVER_META_LIST,
    DEFAULT_COLOR,
} from "./mount_common";

/** 一次挂载配置的全部可编辑字段 */
export interface MountFormValue {
    driver: string;
    mount_path: string;
    credential_id: string;
    account_id: string;
    root_dir: string;
    note: string;
    /** 挂载点在文件列表里的云图标颜色 */
    color: string;
    readonly: boolean;
    forward_to_remote: boolean;
}

/** 新建时的默认值 */
export function empty_mount_form(): MountFormValue {
    return {
        driver: "webdav",
        mount_path: "",
        credential_id: "",
        account_id: "",
        root_dir: "",
        note: "",
        color: DEFAULT_COLOR,
        readonly: false,
        forward_to_remote: false,
    };
}

interface Props {
    value: MountFormValue;
    onChange: (v: MountFormValue) => void;
    /** 本页已加载的凭据列表 */
    creds: CredentialRow[];
    /**
     * 是否渲染「本地目录」输入框。
     * 设置页新增挂载要手填它；在文件页右键某个目录挂载时这个路径是固定的，传 false。
     */
    edit_mount_path?: boolean;
}

/**
 * 挂载配置表单。设置页的「网盘挂载」和文件页右键的「挂载目录」共用这一份，
 * 字段、校验提示、联动规则（换类型/换凭据清空下级字段）都只维护在这里。
 */
export default function MountForm(props: Props) {
    const {t} = useTranslation();
    const {value, onChange, creds} = props;

    const meta = DRIVER_META_LIST.find(d => d.type === value.driver);
    /** 位置是「可远程列出」的形式（SMB 共享名、S3 存储桶 + 前缀） */
    const use_location_list = meta?.location === "share";
    /** 位置从凭据里的「名称 → 路径」映射中挑（本地目录） */
    const use_local_source = meta?.location === "local";
    /** 当前凭据登记的本地源目录映射 */
    const local_sources: LocalSourceRow[] = creds.find(c => c.id === value.credential_id)?.local_sources ?? [];
    const local_options = local_sources.map(v => ({title: `${v.name}（${v.path}）`, value: v.name}));

    const cur_account_options = account_options(value.credential_id, creds);
    const need_account = need_account_of(value.credential_id, creds);

    /** 路径字段按协议叫法命名，不要一律叫「起始目录」 */
    const dir_label = () => {
        if (value.driver === "smb" || value.driver === "s3") {
            return "子路径";
        }
        if (value.driver === "baidu") {
            return "网盘目录";
        }
        if (value.driver === "tcp_proxy") {
            return "对端目录";
        }
        return "目录";
    };

    return (<>
        <InputRow label={t("挂载类型")} label_width={"6rem"}>
            <Select value={value.driver}
                    options={DRIVER_META_LIST.map(d => ({title: d.name, value: d.type}))}
                    onChange={(v) => {
                        // 换类型时清掉已选凭据（类型可能不匹配）和位置（语义不同）
                        onChange({...value, driver: v, credential_id: "", account_id: "", root_dir: ""});
                    }}/>
        </InputRow>
        <InputRow label={t("凭据")} label_width={"6rem"} required>
            <Select value={value.credential_id} options={credential_options(value.driver, creds)}
                    onChange={(v) => {
                        // 换凭据时清掉已选账号（账号属于原凭据）
                        onChange({...value, credential_id: v, account_id: "", root_dir: ""});
                    }}/>
        </InputRow>
        {/* 只有「一凭据多账号」的凭据（百度、内网穿透）才需要再选具体账号 */}
        {need_account && <InputRow label={t("账号")} label_width={"6rem"} required>
            <Select value={value.account_id} options={cur_account_options}
                    onChange={(v) => onChange({...value, account_id: v, root_dir: ""})}/>
        </InputRow>}
        {props.edit_mount_path !== false && <InputRow label={t("本地目录")} label_width={"6rem"} required>
            <InputText placeholder={t("被挂载的本地绝对路径")} value={value.mount_path}
                       handleInputChange={(v) => onChange({...value, mount_path: v})}/>
        </InputRow>}
        {/* 位置：所有驱动都同时支持「列表/目录树挑选」和「直接手填」 */}
        {use_location_list && <InputRow label={t(meta?.location_label === "s3_bucket" ? "存储桶" : "共享目录")}
                                        label_width={"6rem"} required>
            <RemotePathPicker driver={value.driver} credential_id={value.credential_id}
                              account_id={value.account_id}
                              require_account={need_account} editable
                              value={value.root_dir} onChange={(v) => onChange({...value, root_dir: v})}/>
        </InputRow>}
        {use_local_source && <InputRow label={t("源目录")} label_width={"6rem"} required>
            <Select value={value.root_dir} options={local_options}
                    placeholder={t("选择源目录")}
                    onChange={(v) => onChange({...value, root_dir: v})}/>
            <InputText value={String(value.root_dir ?? "")} placeholder={t("src_dir_ph")}
                       handleInputChange={(v) => onChange({...value, root_dir: String(v ?? "").trim()})}/>
        </InputRow>}
        {!use_location_list && !use_local_source && <InputRow label={t(dir_label())} label_width={"6rem"}>
            <RemotePathPicker driver={value.driver} credential_id={value.credential_id}
                              account_id={value.account_id}
                              require_account={need_account} editable
                              editable_placeholder={value.driver === "sftp" ? t("sftp_path_ph") : undefined}
                              value={value.root_dir} onChange={(v) => onChange({...value, root_dir: v})}/>
        </InputRow>}
        <InputRow label={t("备注")} label_width={"6rem"}>
            <InputText value={value.note}
                       handleInputChange={(v) => onChange({...value, note: v})}/>
        </InputRow>
        <InputRow label={t("标识色")} label_width={"6rem"}>
            <InputText type={"color"} value={value.color}
                       handleInputChange={(v) => onChange({...value, color: v})}/>
        </InputRow>
        <InputRow label={t("ro")} label_width={"6rem"}>
            <Select value={value.readonly}
                    options={[{title: t("只读"), value: true}, {title: t("读写"), value: false}]}
                    onChange={(v) => onChange({...value, readonly: v})}/>
        </InputRow>
        {/* 只有内网穿透挂载能转发：其它驱动的对端不是 FileCat，没有它自己的前端和终端 */}
        {value.driver === "tcp_proxy" && <InputRow label={t("ftr2rmt")} label_width={"6rem"}>
            <Switch checked={Boolean(value.forward_to_remote)}
                    onChange={(v) => onChange({...value, forward_to_remote: v})}
                    title={t("ftr2rmt_tip")}/>
        </InputRow>}
    </>);
}
