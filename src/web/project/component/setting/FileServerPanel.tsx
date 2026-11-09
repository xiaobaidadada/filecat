import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import {ActionButton} from "../../../meta/component/Button";
import Switch from "../../../meta/component/Button";
import {InputRow, InputText, Select} from "../../../meta/component/Input";
import {Table} from "../../../meta/component/Table";
import {InstanceItem} from "../../../meta/component/InstanceList";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {fileServerHttp} from "../../util/config";
import {NotySuccess} from "../../util/noty";
import {using_confirm} from "../prompts/prompt.util";
import {using_tip} from "../prompts/prompts.util";

/** 协议类型 */
const PROTOCOLS = [
    {value: "sftp", label: "SFTP"},
    {value: "webdav", label: "WebDAV"},
    {value: "smb", label: "SMB"},
];

/** SMB 共享行 */
interface SmbShareRow {
    share_name: string;
    path: string;
    readonly: boolean;
}

/** WebDAV 共享行 */
interface WebdavShareRow {
    url_path: string;
    path: string;
    readonly: boolean;
}

/** SFTP 账号行 */
interface SftpAccountRow {
    username: string;
    password: string;
    path: string;
    readonly: boolean;
}

/** 列表行：各协议带自己的配置 */
interface ServerRow {
    id: string;
    type: string;
    note: string;
    enabled: boolean;
    port: number;
    readonly: boolean;
    running: boolean;
    smb?: {hostname: string; username: string; password: string; shares: SmbShareRow[]};
    webdav?: {username: string; password: string; shares: WebdavShareRow[]};
    sftp?: {shares: SftpAccountRow[]};
}

/** 各协议的新建空行 */
function empty_smb_share(): SmbShareRow {
    return {share_name: "", path: "", readonly: false};
}

function empty_webdav_share(): WebdavShareRow {
    return {url_path: "", path: "", readonly: false};
}

function empty_sftp_account(): SftpAccountRow {
    return {username: "", password: "", path: "", readonly: false};
}

/**
 * 文件服务。
 *
 * 把本地目录以 SMB/WebDAV/SFTP 协议对外提供，与「网盘挂载」方向相反。
 * 左侧是服务列表，右侧是添加/编辑面板（与用户管理页交互一致）。
 *
 * 三条共享按协议的语义不同：
 *   SMB    —— 共享名，客户端访问 \\host\<share_name>
 *   SFTP   —— 登录用户名，登录后根目录即该共享的目录
 *   WebDAV —— URL 路径段，客户端访问 /<url_path>，账号为服务级
 */
export default function FileServerPanel() {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const tip = using_tip();

    const [list, set_list] = useState<ServerRow[]>([]);
    /** 面板模式：none 关闭，add 新增，edit 编辑 */
    const [mode, set_mode] = useState<"none" | "add" | "edit">("none");

    // 表单字段
    const [id, set_id] = useState("");
    const [type, set_type] = useState("sftp");
    const [note, set_note] = useState("");
    const [port, set_port] = useState(0);
    const [readonly, set_readonly] = useState(false);

    // 各协议的状态完全独立，互不干扰
    const [smb_hostname, set_smb_hostname] = useState("");
    const [smb_username, set_smb_username] = useState("");
    const [smb_password, set_smb_password] = useState("");
    const [smb_shares, set_smb_shares] = useState<SmbShareRow[]>([empty_smb_share()]);

    const [webdav_username, set_webdav_username] = useState("");
    const [webdav_password, set_webdav_password] = useState("");
    const [webdav_shares, set_webdav_shares] = useState<WebdavShareRow[]>([empty_webdav_share()]);

    const [sftp_accounts, set_sftp_accounts] = useState<SftpAccountRow[]>([empty_sftp_account()]);

    const load = async () => {
        const rsp = await fileServerHttp.post("list", {});
        set_list(rsp?.data ?? []);
    };

    useEffect(() => {
        void load();
    }, []);

    const reset_form = () => {
        set_id("");
        set_type("sftp");
        set_note("");
        set_port(0);
        set_readonly(false);
        set_smb_hostname("");
        set_smb_username("");
        set_smb_password("");
        set_smb_shares([empty_smb_share()]);
        set_webdav_username("");
        set_webdav_password("");
        set_webdav_shares([empty_webdav_share()]);
        set_sftp_accounts([empty_sftp_account()]);
    };

    const close_form = () => {
        set_mode("none");
        reset_form();
    };

    const start_add = () => {
        reset_form();
        // 给个常用端口，用户可改
        set_port(2022);
        set_mode("add");
    };

    const edit = (item: ServerRow) => {
        reset_form();
        set_id(item.id);
        set_type(item.type);
        set_note(item.note);
        set_port(item.port);
        set_readonly(item.readonly);
        set_smb_hostname(item.smb?.hostname ?? "");
        set_smb_username(item.smb?.username ?? "");
        set_smb_password(item.smb?.password ?? "");
        set_smb_shares(item.smb?.shares?.length ? item.smb.shares.map((v) => ({...v})) : [empty_smb_share()]);
        set_webdav_username(item.webdav?.username ?? "");
        set_webdav_password(item.webdav?.password ?? "");
        set_webdav_shares(item.webdav?.shares?.length ? item.webdav.shares.map((v) => ({...v})) : [empty_webdav_share()]);
        set_sftp_accounts(item.sftp?.shares?.length ? item.sftp.shares.map((v) => ({...v})) : [empty_sftp_account()]);
        set_mode("edit");
    };

    /** 当前协议对应的共享列表 */
    const shares_of = (protocol: string): any[] => {
        if (protocol === "smb") {
            return smb_shares;
        }
        if (protocol === "webdav") {
            return webdav_shares;
        }
        return sftp_accounts;
    };

    /** 当前协议的共享列表写回 */
    const set_shares_of = (protocol: string, next: any[]) => {
        if (protocol === "smb") {
            set_smb_shares(next);
            return;
        }
        if (protocol === "webdav") {
            set_webdav_shares(next);
            return;
        }
        set_sftp_accounts(next);
    };

    /** 改一条共享的某个字段 */
    const change_share = (protocol: string, index: number, patch: any) => {
        set_shares_of(protocol, shares_of(protocol).map((v, i) => (i === index ? {...v, ...patch} : v)));
    };

    const add_share = (protocol: string) => {
        const empty = protocol === "smb"
            ? empty_smb_share()
            : protocol === "webdav"
                ? empty_webdav_share()
                : empty_sftp_account();
        set_shares_of(protocol, [...shares_of(protocol), empty]);
    };

    const remove_share = (protocol: string, index: number) => {
        set_shares_of(protocol, shares_of(protocol).filter((_, i) => i !== index));
    };

    const save = async () => {
        // 只提交当前协议对应的那份配置
        const body: any = {
            type,
            note,
            port: Number(port),
            readonly,
        };
        if (type === "smb") {
            body.smb = {hostname: smb_hostname, username: smb_username, password: smb_password, shares: smb_shares};
        }
        if (type === "webdav") {
            body.webdav = {username: webdav_username, password: webdav_password, shares: webdav_shares};
        }
        if (type === "sftp") {
            body.sftp = {shares: sftp_accounts};
        }
        if (id) {
            body.id = id;
            await fileServerHttp.post("update", body);
        } else {
            await fileServerHttp.post("add", body);
        }
        NotySuccess(t("保存成功"));
        close_form();
        await load();
    };

    /** 开关切换：开启即启动服务，关闭即停止 */
    const set_enabled = async (item: ServerRow, enabled: boolean) => {
        await fileServerHttp.post(enabled ? "start" : "stop", {id: item.id});
        NotySuccess(enabled ? t("已启用") : t("已禁用"));
        await load();
    };

    const del = (item: ServerRow) => {
        confirm_del({
            title: t("确认删除"),
            confirm_fun: async () => {
                await fileServerHttp.post("delete", {id: item.id});
                NotySuccess(t("删除成功"));
                if (id === item.id) {
                    close_form();
                }
                await load();
            },
        });
    };

    const protocol_name = (v: string) => PROTOCOLS.find(p => p.value === v)?.label ?? v;

    /** 共享一列在列表里的展示：按协议取各自的标识字段 */
    const shares_text = (item: ServerRow) => {
        if (item.type === "smb") {
            return (item.smb?.shares ?? []).map((v) => v.share_name).join(", ");
        }
        if (item.type === "webdav") {
            return (item.webdav?.shares ?? []).map((v) => v.url_path).join(", ");
        }
        return (item.sftp?.shares ?? []).map((v) => v.username).join(", ");
    };

    return (<Row>
        {/* 左侧：服务列表 */}
        <Column widthPer={50} maxWidth={"40rem"}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}><h2>{t("文件服务")}</h2></span>}
                          rightTopCom={<div className={"div-row"}>
                              <ActionButton icon={"add"} title={t("添加")} onClick={start_add}/>
                          </div>}>
                    <Table headers={[t("状态"), t("备注"), t("协议"), t("端口"), t("共享"), t("操作")]}
                           rows={list.map(item => [
                               <Switch checked={item.running} title={t("启用")}
                                       onChange={(value) => set_enabled(item, value)}/>,
                               <TextTip>{item.note || "-"}</TextTip>,
                               <p>{protocol_name(item.type)}</p>,
                               <p>{item.port}</p>,
                               <TextTip>{shares_text(item) || "-"}</TextTip>,
                               <div>
                                   <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                                   <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>
                               </div>,
                           ])}/>
                </CardFull>
            </Dashboard>
        </Column>

        {/* 右侧：添加/编辑面板 */}
        <Column widthPer={50} maxWidth={"40rem"}>
            {mode !== "none" && <Dashboard>
                <Card self_title={<span className={" div-row "}>
                    <h2>{t(mode === "add" ? "添加" : "编辑")}</h2>
                    <ActionButton icon={"info"} title={t("说明")} onClick={() => tip(t("smb_known_issue_tip"))}/>
                </span>}
                      rightBottomCom={<div>
                          <ActionButton icon={"cancel"} title={t("取消")} onClick={close_form}/>
                          <ActionButton icon={"save"} title={t("保存")} onClick={save}/>
                      </div>}>

                    <InputRow label={t("协议")} label_width={"7rem"} required>
                        <Select value={type} options={PROTOCOLS} onChange={(v) => set_type(v)}/>
                    </InputRow>
                    <InputRow label={t("端口")} label_width={"7rem"} required>
                        <InputText placeholder={"1-65535"} value={String(port || "")}
                                   handleInputChange={(v) => set_port(Number(v) || 0)}/>
                    </InputRow>
                    <InputRow label={t("备注")} label_width={"7rem"}>
                        <InputText placeholder={t("列表显示的名称")} value={note}
                                   handleInputChange={set_note}/>
                    </InputRow>
                    <InputRow label={t("只读")} label_width={"7rem"}>
                        <Switch checked={readonly} onChange={set_readonly}/>
                    </InputRow>

                    {/* WebDAV 服务级账号：一个账号可访问全部共享；留空即匿名访问 */}
                    {type === "webdav" && <React.Fragment>
                        <InputRow label={t("用户名")} label_width={"7rem"}>
                            <InputText placeholder={t("留空则不验证身份")} value={webdav_username}
                                       handleInputChange={set_webdav_username}/>
                        </InputRow>
                        <InputRow label={t("密码")} label_width={"7rem"}>
                            <InputText type={"password"} value={webdav_password}
                                       handleInputChange={set_webdav_password}/>
                        </InputRow>
                    </React.Fragment>}

                    {/* SMB 服务端主机名与服务级账号：SMB 认证在 session 阶段，早于选共享 */}
                    {type === "smb" && <React.Fragment>
                        <InputRow label={t("主机名")} label_width={"7rem"}>
                            <InputText value={smb_hostname} handleInputChange={set_smb_hostname}/>
                        </InputRow>
                        <InputRow label={t("用户名")} label_width={"7rem"}>
                            <InputText placeholder={t("留空则不验证身份")} value={smb_username}
                                       handleInputChange={set_smb_username}/>
                        </InputRow>
                        <InputRow label={t("密码")} label_width={"7rem"}>
                            <InputText type={"password"} value={smb_password}
                                       handleInputChange={set_smb_password}/>
                        </InputRow>
                    </React.Fragment>}

                    {/* 多共享：每条一个实例项，添加/删除都在实例的工具条上 */}
                    {shares_of(type).map((share: any, index: number) => (
                        <InstanceItem key={index}
                                      title={t(type === "sftp" ? "账号" : "共享") + ` #${index + 1}`}
                                      toolbar={<>
                                          {type === "smb" && <>
                                              <span>{t("共享名")}</span>
                                              <InputText value={share.share_name} no_border={true} width={"8rem"}
                                                         placeholder={"share"}
                                                         handleInputChange={(v) => change_share(type, index, {share_name: v})}/>
                                          </>}
                                          {type === "webdav" && <>
                                              <span>{t("路径")}</span>
                                              <InputText value={share.url_path} no_border={true} width={"8rem"}
                                                         placeholder={"docs"}
                                                         handleInputChange={(v) => change_share(type, index, {url_path: v})}/>
                                          </>}
                                          {type === "sftp" && <>
                                              <span>{t("用户名")}</span>
                                              <InputText value={share.username} no_border={true} width={"8rem"}
                                                         handleInputChange={(v) => change_share(type, index, {username: v})}/>
                                              <span>{t("密码")}</span>
                                              <InputText type={"password"} value={share.password} no_border={true}
                                                         width={"8rem"}
                                                         handleInputChange={(v) => change_share(type, index, {password: v})}/>
                                          </>}
                                          <ActionButton icon={"add"} title={t("添加")}
                                                        onClick={() => add_share(type)}/>
                                          <ActionButton icon={"delete"} title={t("删除")}
                                                        onClick={() => remove_share(type, index)}/>
                                      </>}>
                            <InputRow label={t("目录")} label_width={"7rem"} required>
                                <InputText placeholder={t("对外提供的本地绝对路径")} value={share.path}
                                           handleInputChange={(v) => change_share(type, index, {path: v})}/>
                            </InputRow>
                            <InputRow label={t("只读")} label_width={"7rem"}>
                                <Switch checked={share.readonly}
                                        onChange={(v) => change_share(type, index, {readonly: v})}/>
                            </InputRow>
                        </InstanceItem>
                    ))}
                </Card>
            </Dashboard>}
        </Column>
    </Row>);
}
