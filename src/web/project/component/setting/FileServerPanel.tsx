import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import {ActionButton} from "../../../meta/component/Button";
import Switch from "../../../meta/component/Button";
import {InputRow, InputText, Select} from "../../../meta/component/Input";
import {Table} from "../../../meta/component/Table";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {fileServerHttp} from "../../util/config";
import {NotySuccess} from "../../util/noty";
import {using_confirm} from "../prompts/prompt.util";

/** 协议类型 */
const PROTOCOLS = [
    {value: "sftp", label: "SFTP"},
    {value: "webdav", label: "WebDAV"},
    {value: "smb", label: "SMB"},
];

/** 列表行 */
interface ServerRow {
    id: string;
    type: string;
    note: string;
    enabled: boolean;
    port: number;
    root_path: string;
    readonly: boolean;
    running: boolean;
    sftp_username?: string;
    sftp_has_password?: boolean;
    webdav_username?: string;
    webdav_has_password?: boolean;
    smb_share_name?: string;
    smb_hostname?: string;
}

/**
 * 文件服务。
 *
 * 把本地目录以 SMB/WebDAV/SFTP 协议对外提供，与「网盘挂载」方向相反。
 * 左侧是服务列表，右侧是添加/编辑面板（与用户管理页交互一致）。
 */
export default function FileServerPanel() {
    const {t} = useTranslation();
    const confirm_del = using_confirm();

    const [list, set_list] = useState<ServerRow[]>([]);
    /** 面板模式：none 关闭，add 新增，edit 编辑 */
    const [mode, set_mode] = useState<"none" | "add" | "edit">("none");

    // 表单字段
    const [id, set_id] = useState("");
    const [type, set_type] = useState("sftp");
    const [note, set_note] = useState("");
    const [port, set_port] = useState(0);
    const [root_path, set_root_path] = useState("");
    const [readonly, set_readonly] = useState(false);

    const [sftp_username, set_sftp_username] = useState("");
    const [sftp_password, set_sftp_password] = useState("");

    const [webdav_username, set_webdav_username] = useState("");
    const [webdav_password, set_webdav_password] = useState("");

    const [smb_share_name, set_smb_share_name] = useState("");
    const [smb_hostname, set_smb_hostname] = useState("");

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
        set_root_path("");
        set_readonly(false);
        set_sftp_username("");
        set_sftp_password("");
        set_webdav_username("");
        set_webdav_password("");
        set_smb_share_name("");
        set_smb_hostname("");
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
        set_root_path(item.root_path);
        set_readonly(item.readonly);
        set_sftp_username(item.sftp_username ?? "");
        set_webdav_username(item.webdav_username ?? "");
        set_smb_share_name(item.smb_share_name ?? "");
        set_smb_hostname(item.smb_hostname ?? "");
        // 密码类字段留空表示不修改
        set_mode("edit");
    };

    const save = async () => {
        const body: any = {
            type,
            note,
            port: Number(port),
            root_path,
            readonly,
            sftp_username,
            sftp_password,
            webdav_username,
            webdav_password,
            smb_share_name,
            smb_hostname,
        };
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

    return (<Row>
        {/* 左侧：服务列表 */}
        <Column widthPer={50} maxWidth={"40rem"}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}><h2>{t("文件服务")}</h2></span>}
                          rightTopCom={<div className={"div-row"}>
                              <ActionButton icon={"add"} title={t("添加")} onClick={start_add}/>
                          </div>}>
                    <Table headers={[t("状态"), t("备注"), t("协议"), t("端口"), t("fsvroot"), t("操作")]}
                           rows={list.map(item => [
                               <Switch checked={item.running} title={t("启用")}
                                       onChange={(value) => set_enabled(item, value)}/>,
                               <TextTip>{item.note || "-"}</TextTip>,
                               <p>{protocol_name(item.type)}</p>,
                               <p>{item.port}</p>,
                               <TextTip>{item.root_path}</TextTip>,
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
                </span>}
                      rightBottomCom={<div>
                          <ActionButton icon={"cancel"} title={t("取消")} onClick={close_form}/>
                          <ActionButton icon={"save"} title={t("保存")} onClick={save}/>
                      </div>}>

                    <InputRow label={t("协议")} label_width={"7rem"} required>
                        <Select value={type} options={PROTOCOLS} onChange={(v) => set_type(v)}/>
                    </InputRow>
                    <InputRow label={t("fsvroot")} label_width={"7rem"} required>
                        <InputText placeholder={t("对外提供的本地绝对路径")} value={root_path}
                                   handleInputChange={set_root_path}/>
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

                    {/* SFTP 专属配置 */}
                    {type === "sftp" && <React.Fragment>
                        <InputRow label={t("用户名")} label_width={"7rem"} required>
                            <InputText value={sftp_username} handleInputChange={set_sftp_username}/>
                        </InputRow>
                        <InputRow label={t("密码")} label_width={"7rem"} required>
                            <InputText placeholder={id ? t("留空不修改") : ""} value={sftp_password}
                                       handleInputChange={set_sftp_password}/>
                        </InputRow>
                    </React.Fragment>}

                    {/* WebDAV 专属配置 */}
                    {type === "webdav" && <React.Fragment>
                        <InputRow label={t("用户名")} label_width={"7rem"} required>
                            <InputText value={webdav_username} handleInputChange={set_webdav_username}/>
                        </InputRow>
                        <InputRow label={t("密码")} label_width={"7rem"} required>
                            <InputText placeholder={id ? t("留空不修改") : ""} value={webdav_password}
                                       handleInputChange={set_webdav_password}/>
                        </InputRow>
                    </React.Fragment>}

                    {/* SMB 专属配置 */}
                    {type === "smb" && <React.Fragment>
                        <InputRow label={t("共享名")} label_width={"7rem"} required>
                            <InputText value={smb_share_name} handleInputChange={set_smb_share_name}/>
                        </InputRow>
                        <InputRow label={t("主机名")} label_width={"7rem"}>
                            <InputText value={smb_hostname} handleInputChange={set_smb_hostname}/>
                        </InputRow>
                    </React.Fragment>}
                </Card>
            </Dashboard>}
        </Column>
    </Row>);
}
