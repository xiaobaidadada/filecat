import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {FileTree, FileTreeList, FileTypeEnum} from "../../../../../common/file.pojo";
import {FolderTree} from "../../file/component/studio/Tree/FolderTree";
import {InputText} from "../../../../meta/component/Input";
import {mountHttp} from "../../../util/config";

/**
 * 远端目录树选择器。
 *
 * 复用 Studio 的目录树（FolderTree），展开某个目录时才去后端拉它的子目录，
 * 点目录名即选中它作为挂载位置。用于 SMB 子路径、S3 前缀、
 * SFTP / WebDAV / 百度网盘 / 内网穿透 FileCat 的起始目录。
 */
export default function RemotePathPicker(props: {
    /** 驱动类型 */
    driver: string;
    /** 凭据 id：后端用它补齐密码等已保存字段 */
    credential_id: string;
    /** 账号 id：后端用它取账号密码建连接 */
    account_id?: string;
    /** 该凭据类型是否必须选账号，未选时不去拉目录 */
    require_account?: boolean;
    /** 已选定的路径；空串表示远端根 */
    value: string;
    /** 路径变化回调 */
    onChange: (path: string) => void;
    /**
     * 用手填名字代替目录树（SMB 共享名、S3 存储桶）。
     * 传入时只渲染一个输入框，完全不请求共享列表 ——
     * 有些客户端/服务端拿不到共享枚举，直接填名字更可靠。
     */
    manual_name?: { label: string; placeholder: string };
    /** 手填名字下方的子路径输入框占位文案 */
    sub_placeholder?: string;
    /**
     * 是否在列表/目录树之上始终显示一个手填输入框。
     * 打开后既能从列表挑，也能直接打路径，两者改的是同一个 root_dir。
     */
    editable?: boolean;
    /** 手填框的占位提示，驱动有特殊路径语义时（如 SFTP 的绝对路径）用它覆盖默认文案 */
    editable_placeholder?: string;
}) {
    const {t} = useTranslation();
    /** 根目录下的条目 */
    const [list, set_list] = useState<FileTreeList>([]);
    const [loading, set_loading] = useState(false);

    /**
     * 去掉首尾斜杠。SFTP 的 root 允许以 / 开头表示服务器绝对路径，
     * 那种情况只去尾部斜杠，前导的 / 必须留着（单独一个 / 就是根，不能被清成空串）。
     */
    const normalize = (p: string) => {
        const s = String(p ?? "").trim();
        if (props.driver === "sftp") {
            const v = s.replace(/\/+$/g, "");
            return v === "" && s !== "" ? "/" : v;
        }
        return s.replace(/^\/+|\/+$/g, "");
    };

    /** 列某个目录下的子目录；只看目录，文件不参与选择 */
    const load_dir = async (dir: string): Promise<FileTree[]> => {
        const rsp = await mountHttp.post("share/list", {
            driver: props.driver,
            credential_id: props.credential_id,
            account_id: props.account_id,
            path: normalize(dir),
        });
        const rows = Array.isArray(rsp?.data) ? rsp.data : [];
        return rows.map((v: any) => ({
            name: String(v.name),
            type: FileTypeEnum.folder,
            size: 0,
        }));
    };

    const load_root = async () => {
        if (!props.credential_id) {
            set_list([]);
            return;
        }
        // 需要账号的凭据，账号没选时不能建驱动去列目录
        if (props.require_account && !props.account_id) {
            set_list([]);
            return;
        }
        set_loading(true);
        try {
            set_list(await load_dir(""));
        } catch (e) {
            // Http 层已提示
            set_list([]);
        } finally {
            set_loading(false);
        }
    };

    // 换凭据/账号/驱动时重新拉根；纯手填模式不请求列表
    useEffect(() => {
        if (props.manual_name && !props.editable) {
            return;
        }
        void load_root();
    }, [props.driver, props.credential_id, props.account_id]);

    /**
     * 展开目录时拉它的子项。
     * pre_path 是「根 + 各级名字 + /」，去掉末尾斜杠就是相对路径。
     */
    const click = async (pojo: FileTree, set_children: (l: FileTree[]) => void, pre_path: string) => {
        set_children(await load_dir(normalize(pre_path)));
    };

    /** 点名字就是选中它作为挂载位置，不管它当前是否已展开 */
    const select = (pojo: FileTree, _set_children: (l: FileTree[]) => void, pre_path: string) => {
        props.onChange(normalize(pre_path));
    };

    const current = normalize(props.value);

    // 手填名字模式：输入名字 + 可选子路径，不请求任何列表
    if (props.manual_name && !props.editable) {
        const name = current.split("/")[0] ?? "";
        const sub = current.split("/").slice(1).join("/");
        const join = (n: string, s: string) => {
            const clean_n = normalize(n);
            const clean_s = normalize(s);
            if (!clean_n) {
                return clean_s;
            }
            return clean_s ? `${clean_n}/${clean_s}` : clean_n;
        };
        return (<div className={"rpp-manual"}>
            <InputText value={name} placeholder={props.manual_name.placeholder}
                       handleInputChange={(v) => props.onChange(join(v, sub))}/>
            <InputText value={sub} placeholder={props.sub_placeholder ?? ""}
                       handleInputChange={(v) => props.onChange(join(name, v))}/>
        </div>);
    }

    return (<div className={"rpp"}>
        {/* 手填框：既能从下面挑，也能直接打全路径，改的是同一个值 */}
        {props.editable && <InputText value={current}
                                      placeholder={props.editable_placeholder ?? props.manual_name?.placeholder ?? t("path_ph")}
                                      handleInputChange={(v) => props.onChange(normalize(v))}/>}
        <div className={"rpp-head div-row"}>
            <span className={"rpp-label"}>{t("当前")}</span>
            {/* SFTP 的值本身就是绝对路径，别的驱动是相对路径才需要补前导 / */}
            <span className={"rpp-path"}>{props.driver === "sftp" ? (current || "/") : `/${current}`}</span>
            <button type={"button"} className={"rpp-reset"} onClick={() => props.onChange("")}>
                {t("根目录")}
            </button>
        </div>
        <div className={"rpp-tree"}>
            {loading && <p className={"rpp-empty"}>{t("加载中")}</p>}
            {!loading && list.length === 0 && <p className={"rpp-empty"}>{t("没有子目录")}</p>}
            {!loading && list.length > 0 &&
                <FolderTree list={list} pre_path={""} active_path={current ? current + "/" : undefined}
                            click={click} onSelect={select}/>}
        </div>
    </div>);
}
