import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {$stroe} from "../../util/store";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {Card, CardFull, TextTip} from "../../../meta/component/Card";
import Switch, {ActionButton} from "../../../meta/component/Button";
import {InputText} from "../../../meta/component/Input";
import {Table} from "../../../meta/component/Table";
import {browserProxyPortHttp} from "../../util/config";
import {NotyFail, NotySuccess} from "../../util/noty";
import {copyToClipboard} from "../../util/FunUtil";
import {using_confirm} from "../prompts/prompt.util";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {RCode} from "../../../../common/Result.pojo";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";

/** 一条端口映射（与后端 BrowserProxyPortItem 对应） */
interface ProxyTargetRow {
    id: string;
    proto: string;
    host: string;
    root_path: string;
    port: number;
    note?: string;
    enabled?: boolean; // 是否启用（禁用后不监听端口）
    created_at: number;
}

/**
 * 网页代理目标管理（端口模式）。
 *
 * 每个目标占用一个独立的 FileCat 端口，访问该端口即访问目标站点。
 * 独立端口的好处：SPA 的路由 pathname 天然正确、站点间存储/cookie 天然隔离。
 *
 * 页面结构参考「角色管理」：左侧为列表，右侧为「添加/编辑」表单。
 *
 * 权限：
 *   · UserAuth.browser_proxy      —— 进入本页、查看列表、打开目标
 *   · UserAuth.browser_proxy_edit —— 新增/编辑/删除目标（后端接口同步强制校验）
 */
export default function BrowserProxyTargets() {
    const {t} = useTranslation();
    const confirm_del = using_confirm();
    const {check_user_auth} = use_auth_check();
    /** 是否有编辑权限（无权限时隐藏所有写操作入口） */
    const can_edit = check_user_auth(UserAuth.browser_proxy_edit);
    const [, set_prompt_card] = useAtom($stroe.prompt_card);
    const [rows, set_rows] = useState<ProxyTargetRow[]>([]);
    /** true=新建，false=编辑（仅在表单展开时有意义） */
    const [is_create, set_is_create] = useState(false);
    /** 表单是否展开 */
    const [is_edit, set_is_edit] = useState(false);
    const [id, set_id] = useState("");
    const [address, set_address] = useState("");
    const [note, set_note] = useState("");

    const headers = [t("状态"), t("备注"), t("目标"), t("端口"), t("访问地址"), t("操作")];

    const get_items = async () => {
        try {
            const rsq = await browserProxyPortHttp.get(Http_controller_router.browser_proxy_port_list);
            if (rsq.code === RCode.Success) {
                set_rows(Array.isArray(rsq.data) ? rsq.data : []);
            }
        } catch (e) {
            // Http 层已提示
        }
    };

    useEffect(() => {
        get_items();
    }, []);

    /** 标题旁的信息按钮：说明端口模式的用途 */
    const info_click = () => {
        set_prompt_card({
            open: true,
            title: t("信息"),
            context_div: (
                <div>
                    <ul>
                        <li>{t("wbvpn_port_tip")}</li>
                        <li>{t("wbvpn_port_tip2")}</li>
                        <li>{t("wbvpn_port_tip3")}</li>
                    </ul>
                </div>
            ),
        });
    };

    /** 用某条记录回填表单；传 undefined 表示清空 */
    const set_show_values = (item?: ProxyTargetRow) => {
        set_id(item?.id ?? "");
        // 回填时带上协议前缀与根路径，方便直接编辑
        set_address(item ? `${item.proto}://${item.host}${item.root_path && item.root_path !== "/" ? item.root_path : ""}` : "");
        set_note(item?.note ?? "");
    };

    const close_form = () => {
        set_is_create(false);
        set_is_edit(false);
        set_show_values(undefined);
    };

    const create_target = () => {
        set_is_create(true);
        set_is_edit(true);
        set_show_values(undefined);
    };

    const edit_target = (item: ProxyTargetRow) => {
        set_is_create(false);
        set_is_edit(true);
        set_show_values(item);
    };

    const save = async () => {
        if (!address.trim()) {
            NotyFail(t("目标地址不能为空"));
            return;
        }
        try {
            if (is_create) {
                await browserProxyPortHttp.post(Http_controller_router.browser_proxy_port_add, {
                    address: address.trim(),
                    note,
                });
                NotySuccess(t("添加成功"));
            } else {
                // 编辑：备注 + 目标地址
                await browserProxyPortHttp.post(Http_controller_router.browser_proxy_port_update, {
                    id,
                    address: address.trim(),
                    note,
                });
                NotySuccess(t("修改成功"));
            }
            close_form();
            await get_items();
        } catch (e) {
            // Http 层已提示（目标被策略拒绝时后端会返回原因）
        }
    };

    const del = (item: ProxyTargetRow) => {
        confirm_del({
            title: t("确认删除"),
            sub_title: item.host,
            confirm_fun: async () => {
                try {
                    await browserProxyPortHttp.post(Http_controller_router.browser_proxy_port_remove, {id: item.id});
                    NotySuccess(t("已删除"));
                    await get_items();
                } catch (e) {
                    // Http 层已提示
                }
            },
        });
    };

    /** 启用 / 禁用目标 */
    const set_enabled = async (item: ProxyTargetRow, enabled: boolean) => {
        try {
            await browserProxyPortHttp.post(Http_controller_router.browser_proxy_port_set_enabled, {id: item.id, enabled});
            NotySuccess(enabled ? t("已启用") : t("已禁用"));
            await get_items();
        } catch (e) {
            // Http 层已提示
        }
    };

    /** 目标访问地址：用当前页面的主机名 + 分配端口 */
    const access_url = (item: ProxyTargetRow) => {
        const cur_host = window.location.hostname || "127.0.0.1";
        return `http://${cur_host}:${item.port}/`;
    };

    /** 拼出带登录 token 的访问地址（首次访问用于鉴权并种 cookie） */
    const access_url_with_token = (item: ProxyTargetRow) => {
        const token = localStorage.getItem("token") || "";
        return `${access_url(item)}${token ? `?_t=${encodeURIComponent(token)}` : ""}`;
    };

    const copy_url = async (item: ProxyTargetRow) => {
        const url = access_url(item);
        if (copyToClipboard(url)) {
            NotySuccess(t("已复制"));
        } else {
            NotyFail(t("复制失败"));
        }
    };

    /** 在新标签页打开目标 */
    const open_new_tab = (item: ProxyTargetRow) => {
        window.open(access_url_with_token(item), "_blank", "noopener,noreferrer");
    };

    /** 在当前窗口打开目标 */
    const open_current = (item: ProxyTargetRow) => {
        window.location.href = access_url_with_token(item);
    };

    return (<Row>
        <Column widthPer={can_edit ? 55 : 100} maxWidth={can_edit ? "90rem" : undefined}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}><h2>{t("网页代理目标")}</h2>
                    <ActionButton icon={"info"} title={t("信息")} onClick={info_click}/></span>}
                          rightTopCom={<div>
                              {can_edit && !is_edit && <ActionButton icon={"add"} title={t("添加")} onClick={create_target}/>}
                          </div>}>
                    <Table headers={headers} rows={rows.map((item) => {
                        const new_list = [
                            <Switch checked={item.enabled !== false} disabled={!can_edit}
                                    title={t("启用")}
                                    onChange={(value) => set_enabled(item, value)}/>,
                            <TextTip>{item.note || "-"}</TextTip>,
                            <TextTip>{`${item.proto}://${item.host}`}</TextTip>,
                            <TextTip>{String(item.port)}</TextTip>,
                            <TextTip>{access_url(item)}</TextTip>,
                            <div>
                                <ActionButton icon={"open_in_new"} title={t("新窗口打开")} onClick={() => open_new_tab(item)}/>
                                <ActionButton icon={"tab"} title={t("当前窗口打开")} onClick={() => open_current(item)}/>
                                <ActionButton icon={"content_copy"} title={t("复制")} onClick={() => copy_url(item)}/>
                                {can_edit && <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit_target(item)}/>}
                                {can_edit && <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(item)}/>}
                            </div>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>
        </Column>
        {can_edit && is_edit && <Column widthPer={45} maxWidth={"40rem"}>
            <Dashboard>
                <Card self_title={<span className={" div-row "}><h2>{t(`${is_create ? "添加" : "编辑"}`)}</h2></span>}
                      rightBottomCom={<div>
                          <ActionButton icon={"cancel"} title={t("取消")} onClick={close_form}/>
                          <ActionButton icon={is_create ? "add_circle" : "save"} title={is_create ? t("添加") : t("保存")}
                                        onClick={save}/>
                      </div>}>
                    <label>{t("目标地址")}</label>
                    <InputText value={address} placeholder={t("目标地址例如")}
                               handleInputChange={(value) => set_address(value)}/>
                    <label>{t("备注")}</label>
                    <InputText value={note} handleInputChange={(value) => set_note(value)}/>
                </Card>
            </Dashboard>
        </Column>}
    </Row>);
}
