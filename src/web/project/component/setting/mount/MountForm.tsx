import RemotePathPicker from "./RemotePathPicker";
import React, {useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {InputRow, InputText, Select} from "../../../../meta/component/Input";
import Switch from "../../../../meta/component/Button";
import {useAtom} from "jotai";
import {$stroe} from "../../../util/store";
import {userHttp} from "../../../util/config";
import {Http_controller_router} from "../../../../../common/req/http_controller_router";
import {MountColorItem} from "../../../../../common/req/setting.req";
import {GlobalContext} from "../../../GlobalProvider";
import {createPortal} from "react-dom";
import {
    CredentialRow,
    account_options,
    credential_options,
    need_account_of,
    DRIVER_META_LIST,
    DEFAULT_COLOR,
} from "./mount_common";

/** 挂载标识色的默认预设，用户未自定义时使用 */
const MOUNT_COLOR_PRESETS: MountColorItem[] = [
    {color: "#4a9eff"}, {color: "#2ecc71"}, {color: "#f1c40f"}, {color: "#e67e22"},
    {color: "#e74c3c"}, {color: "#9b59b6"}, {color: "#1abc9c"}, {color: "#34495e"},
    {color: "#16a085"}, {color: "#d35400"}, {color: "#7f8c8d"}, {color: "#c0392b"},
];

/**
 * 挂载配置专用的标识色选择：色块打开系统调色板，中间输入框可直接手敲色值，
 * 右侧箭头展开预设色板。预设色板保存在当前用户的个人数据里，可增删改颜色与备注。
 */
function MountColorPicker(props: { value: string; onChange: (color: string) => void }) {
    const {t} = useTranslation();
    const {initUserInfo} = React.useContext(GlobalContext);
    const [open, setOpen] = useState(false);
    const [edit_mode, set_edit_mode] = useState(false);
    const [panel_pos, set_panel_pos] = useState({left: 0, top: 0});
    const [text, setText] = useState(props.value);
    const rootRef = useRef<HTMLDivElement>(null);
    const [user_base_info] = useAtom($stroe.user_base_info);
    const [presets, set_presets] = useState<MountColorItem[]>(MOUNT_COLOR_PRESETS);

    // 从当前用户数据加载预设；没有自定义过就用默认色板
    useEffect(() => {
        const list = user_base_info?.user_data?.mount_color_list;
        set_presets(list ?? MOUNT_COLOR_PRESETS);
    }, [user_base_info?.user_data?.mount_color_list]);

    // 外部色值变化时同步输入框文本
    useEffect(() => {
        setText(props.value);
    }, [props.value]);

    // 点击组件外部关闭色板
    useEffect(() => {
        if (!open) {
            return;
        }
        const on_doc_down = (e: MouseEvent) => {
            // 色板通过 portal 挂在 body 上，需单独判断是否点在色板内部
            const panel = document.querySelector(".mount-color__panel");
            const in_panel = panel?.contains(e.target as Node);
            if (rootRef.current && !rootRef.current.contains(e.target as Node) && !in_panel) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", on_doc_down);
        return () => document.removeEventListener("mousedown", on_doc_down);
    }, [open]);

    /** 按当前组件位置计算色板坐标，下方放不下时向上展开 */
    const place_panel = (editing: boolean, count: number) => {
        if (!rootRef.current) {
            return;
        }
        const rect = rootRef.current.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom;
        // 估算色板高度：编辑模式每行约 2.2rem 加工具条，浏览模式两行色块加工具条
        const panel_h = editing ? Math.min(count * 36 + 48, window.innerHeight * 0.6) : 130;
        const top = below < panel_h && rect.top > below ? rect.top - panel_h - 4 : rect.bottom + 4;
        set_panel_pos({left: rect.left, top: Math.max(4, top)});
    };

    // 色板打开期间跟随页面滚动重新定位（忽略色板自身的滚动）
    useEffect(() => {
        if (!open) {
            return;
        }
        const on_scroll = (e: Event) => {
            const panel = document.querySelector(".mount-color__panel");
            if (panel && panel.contains(e.target as Node)) {
                return;
            }
            place_panel(edit_mode, presets.length);
        };
        window.addEventListener("scroll", on_scroll, true);
        window.addEventListener("resize", on_scroll);
        return () => {
            window.removeEventListener("scroll", on_scroll, true);
            window.removeEventListener("resize", on_scroll);
        };
    }, [open, edit_mode, presets.length]);


    const toggle_panel = () => {
        if (!open) {
            place_panel(edit_mode, presets.length);
        }
        setOpen((v) => !v);
    };

    /** 切换编辑/浏览模式时色板高度变化，需要重新定位 */
    const toggle_edit_mode = () => {
        const next = !edit_mode;
        set_edit_mode(next);
        place_panel(next, presets.length);
    };

    /** 提交色值：只接受合法的 #rgb / #rrggbb */
    const commit = (raw: string) => {
        const v = raw.trim();
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
            props.onChange(v);
        }
    };

    /** 保存预设到当前用户 */
    const save_presets = async (list: MountColorItem[]) => {
        set_presets(list);
        await userHttp.post(Http_controller_router.user_save_private_attr, {
            is_mount_color: true,
            mount_color_list: list,
        });
        await initUserInfo();
    };

    /** 修改某个预设的颜色或备注 */
    const update_preset = (index: number, patch: Partial<MountColorItem>) => {
        save_presets(presets.map((it, i) => (i === index ? {...it, ...patch} : it)));
    };

    const add_preset = () => {
        save_presets([...presets, {color: props.value, note: ""}]);
        place_panel(edit_mode, presets.length + 1);
    };

    const del_preset = (index: number) => {
        save_presets(presets.filter((_, i) => i !== index));
    };

    return <div className={"mount-color"} ref={rootRef}>
        {/* 色块：点击打开系统调色板 */}
        <label className={"mount-color__swatch"} style={{background: props.value}}>
            <input type={"color"} value={props.value}
                   onChange={(e) => props.onChange(e.target.value)}/>
        </label>
        {/* 手敲输入框：失焦或回车时提交 */}
        <input className={"mount-color__text"} value={text}
               onChange={(e) => setText(e.target.value)}
               onBlur={() => {
                   commit(text);
                   setText(props.value);
               }}
               onKeyDown={(e) => {
                   if (e.key === "Enter") {
                       commit(text);
                   }
               }}/>
        {/* 箭头：展开预设色板 */}
        <span className={"mount-color__arrow material-icons"}
              onClick={toggle_panel}>arrow_drop_down</span>
        {open && createPortal(<div className={"mount-color__panel"}
                                   style={{left: panel_pos.left, top: panel_pos.top}}>
            {edit_mode ? <div className={"mount-color__edit"}>
                {/* 编辑模式：逐项修改颜色与备注 */}
                {presets.map((it, i) => (
                    <div key={i} className={"mount-color__row"}>
                        <label className={"mount-color__swatch mount-color__swatch--sm"}
                               style={{background: it.color}}>
                            <input type={"color"} value={it.color}
                                   onChange={(e) => update_preset(i, {color: e.target.value})}/>
                        </label>
                        <input className={"mount-color__text"} value={it.color}
                               onChange={(e) => update_preset(i, {color: e.target.value})}/>
                        <input className={"mount-color__note"} value={it.note ?? ""}
                               placeholder={t("备注")}
                               onChange={(e) => update_preset(i, {note: e.target.value})}/>
                        <i className={"material-icons mount-color__del"}
                           title={t("删除")}
                           onClick={() => del_preset(i)}>close</i>
                    </div>
                ))}
                <div className={"mount-color__tools"}>
                    <span className={"action"} onClick={add_preset} title={t("添加预设")}>
                        <i className={"material-icons"}>add</i>
                    </span>
                    <span className={"action"} onClick={toggle_edit_mode} title={t("完成")}>
                        <i className={"material-icons"}>check</i>
                    </span>
                </div>
            </div> : <>
                <div className={"mount-color__grid"}>
                    {presets.map((it, i) => (
                        <span key={i} className={"mount-color__cell"}>
                            <span className={"mount-color__item"}
                                  style={{background: it.color}}
                                  title={it.note || undefined}
                                  onClick={() => {
                                      props.onChange(it.color);
                                      setOpen(false);
                                  }}/>
                            <i className={"material-icons mount-color__del"}
                               title={t("删除")}
                               onClick={() => del_preset(i)}>close</i>
                        </span>
                    ))}
                </div>
                <div className={"mount-color__tools"}>
                    <span className={"action"} onClick={add_preset} title={t("添加预设")}>
                        <i className={"material-icons"}>add</i>
                    </span>
                    <span className={"action"} onClick={toggle_edit_mode} title={t("编辑")}>
                        <i className={"material-icons"}>edit</i>
                    </span>
                </div>
            </>}
        </div>, document.body)}
    </div>;
}

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
    /** 当前凭据登记的本地源目录（本地目录类型下，每条账号即一条目录映射） */
    const local_accounts = creds.find(c => c.id === value.credential_id)?.accounts ?? [];
    const local_options = local_accounts.map(v => {
        // 有备注时同时显示名称，格式「名称（备注）」，与账号下拉保持一致
        const name = v.account_name ?? "";
        const title = v.note ? `${name}（${v.note}）` : name;
        return {title, value: v.id};
    });

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
            <Select value={value.account_id} options={local_options}
                    placeholder={t("选择源目录")}
                    onChange={(v) => onChange({...value, account_id: v})}/>
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
            <MountColorPicker value={value.color}
                              onChange={(v) => onChange({...value, color: v})}/>
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
