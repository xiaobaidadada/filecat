import React, {useContext, useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Row, RowColumn} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Table} from "../../../meta/component/Table";
import {InputText, Select} from "../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {
    dir_upload_max_num_item,
    FileQuickCmdItem,
    QuickCmdItem,
    SysSoftware,
    TokenSettingReq
} from "../../../../common/req/setting.req";
import {GlobalContext} from "../../GlobalProvider";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {NotyFail, NotySucess} from "../../util/noty";
import {use_auth_check} from "../../util/store.util";
import {sort} from "../../../../common/ListUtil";
import {env_item} from "../../../../common/req/common.pojo";
import {using_env_prompt} from "./util";

export function Env() {
    const {t, i18n} = useTranslation();
    const {initUserInfo, reloadUserInfo} = useContext(GlobalContext);
    const [rows, setRows] = useState([]);
    const [rows_outside_software, setRows_outside_software] = useState([]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const [protection_sys_dir_rows, set_protection_sys_dir_rows] = useState([]);
    const [dir_upload_rows, set_dir_upload_rows] = useState<dir_upload_max_num_item[]>([]);
    const [env_path_dir_rows, set_env_path_dir_rows] = useState([] as env_item[]);
    const [pty_cmd, set_pty_cmd] = useState("");

    const headers_outside_software = [t("软件"), t("是否安装"), t("路径")];
    const protection_dir_headers = [t("编号"), t("路径"), t("备注")];
    const env_path_dir_headers = [t("编号"), t("路径"), t("是否开启"), t("备注")];
    const dir_upload_headers = [t("编号"), t("路径"), t("单用户并发数量"), t("系统并发数量"), t("是否开启大文件断点"), t("大文件判断大小MB"), t("大文件并发数量"), t("大文件分块大小MB"), t("备注")];
    const {check_user_auth} = use_auth_check();

    const get_env = async () => {
        // env path
        const result2 = await settingHttp.get("env/path/get");
        if (result2.code === RCode.Success) {
            set_env_path_dir_rows(result2.data);
        }
    }

    const getItems = async () => {

        const result1 = await settingHttp.get("outside/software/get");
        if (result1.code === RCode.Success) {
            setRows_outside_software(result1.data);
        }


        const result4 = await settingHttp.get("pty_cmd");
        if (result4.code === RCode.Success) {
            set_pty_cmd(result4.data);
        }

        get_env()

        // 系统保护目录
        const result5 = await settingHttp.get("protection_dir/sys");
        if (result5.code === RCode.Success) {
            set_protection_sys_dir_rows(result5.data ?? []);
        }

        // 并发数量限制系统保护目录
        const result6 = await settingHttp.get("dir_upload_max_num");
        if (result6.code === RCode.Success) {
            set_dir_upload_rows(result6.data ?? []);
        }
    }
    useEffect(() => {
        getItems();
    }, []);

    const save_pty_cmd = async () => {
        const result = await settingHttp.post("pty_cmd/save", {str: pty_cmd});
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            reloadUserInfo();
        }
    }


    const protection_sys_dir_save = async () => {
        const result = await settingHttp.post("protection_dir/sys/save", protection_sys_dir_rows);
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            reloadUserInfo();
        }
    }

    const dir_upload_max_num_save = async () => {
        for (const it of dir_upload_rows) {
            if (it.open_ws_file) {
                // debugger
                if (typeof it.ws_file_block_mb_size !== "number") {
                    NotyFail(`编号:${it.index ?? ""} 文件块的大小设置有问题`)
                    return;
                }
                if (typeof it.ws_file_parallel_num !== "number") {
                    NotyFail(`编号:${it.index ?? ""} 并发数量设置有问题`)
                    return;
                }
                if (typeof it.ws_file_standard_size !== "number") {
                    NotyFail(`编号:${it.index ?? ""} 大文件size设置有问题`)
                    return;
                }
            }
        }
        sort(dir_upload_rows, v => v.index);
        const result = await settingHttp.post("dir_upload_max_num/save", dir_upload_rows);
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            reloadUserInfo();
        }
    }


    const protection_sys_dir_add = () => {
        set_protection_sys_dir_rows([...protection_sys_dir_rows, {path: "", note: ""}]);
    }

    const dir_upload_rows_add = () => {
        set_dir_upload_rows([...dir_upload_rows, {path: "", note: ""}]);
    }

    const protection_sys_dir_del = (index) => {
        protection_sys_dir_rows.splice(index, 1);
        set_protection_sys_dir_rows([...protection_sys_dir_rows]);
    }

    const dir_upload_rows_del = (index) => {
        dir_upload_rows.splice(index, 1);
        set_dir_upload_rows([...dir_upload_rows]);
    }
    const env_path_dir_add = () => {
        set_env_path_dir_rows([...env_path_dir_rows, {path: "", note: ""}]);
    }
    const env_path_dir_del = (index) => {
        env_path_dir_rows.splice(index, 1);
        set_env_path_dir_rows([...env_path_dir_rows]);
    }

    // 外部软件
    const save_outside_software = async () => {
        const result = await settingHttp.post("outside/software/save", rows_outside_software);
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            initUserInfo();
        }
    }

    // 外部软件信息解释
    const soft_ware_info_click = using_env_prompt();

    const update_env_path = async () => {
        const result = await settingHttp.post("env/path/save", {paths: env_path_dir_rows});
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            get_env()
            initUserInfo();
        }
    }
    return (<React.Fragment>
        <RowColumn widthPer={100}>
            <CardFull self_title={<span className={" div-row "}><h2>{t("文件上传最大并发限制")}</h2> <ActionButton
                icon={"info"} onClick={() => {
                soft_ware_info_click("文件上传")
            }} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")}
                                                                     onClick={dir_upload_rows_add}/><ActionButton
                icon={"save"} title={t("保存")} onClick={dir_upload_max_num_save}/></div>}>
                <Table headers={dir_upload_headers}
                       rows={dir_upload_rows.map((item: dir_upload_max_num_item, index) => {
                           const new_list = [
                               <InputText value={item.index} placeholder={index} handleInputChange={(value) => {
                                   item.index = parseInt(value);
                               }} no_border={true}/>,
                               <InputText value={item.path} handleInputChange={(value) => {
                                   item.path = value;
                               }} no_border={true}/>,
                               <InputText value={item.user_upload_num} handleInputChange={(value) => {
                                   item.user_upload_num = parseInt(value);
                               }} no_border={true}/>,
                               <InputText value={item.sys_upload_num} handleInputChange={(value) => {
                                   item.sys_upload_num = parseInt(value);
                               }} no_border={true}/>,

                               <Select value={item.open_ws_file === true} onChange={(value) => {
                                   item.open_ws_file = value === "true";
                                   set_dir_upload_rows([...dir_upload_rows])
                               }} options={[{title: t("是"), value: true}, {title: t("否"), value: false}]}
                                       no_border={true}/>,
                               <InputText
                                   value={typeof item.ws_file_standard_size === "number" ? item.ws_file_standard_size / 1024 / 1024 : undefined}
                                   handleInputChange={(value) => {
                                       item.ws_file_standard_size = parseInt(value) * 1024 * 1024;
                                   }} no_border={true}/>,
                               <InputText value={item.ws_file_parallel_num} handleInputChange={(value) => {
                                   item.ws_file_parallel_num = parseInt(value);
                               }} no_border={true}/>,
                               <InputText
                                   value={typeof item.ws_file_block_mb_size === "number" ? item.ws_file_block_mb_size / 1024 / 1024 : undefined}
                                   handleInputChange={(value) => {
                                       item.ws_file_block_mb_size = parseInt(value) * 1024 * 1024;
                                   }} no_border={true}/>,

                               <InputText value={item.note} handleInputChange={(value) => {
                                   item.note = value;
                               }} no_border={true}/>,
                               <ActionButton icon={"delete"} title={t("删除")}
                                             onClick={() => dir_upload_rows_del(index)}/>,
                           ];
                           return new_list;
                       })} width={"10rem"}/>
            </CardFull>
        </RowColumn>
        <Row>

            <Column widthPer={50}>
                <Dashboard>

                    <CardFull self_title={<span className={" div-row "}><h2>{t("PATH")}</h2>
                    <ActionButton icon={"info"} onClick={() => {
                        soft_ware_info_click("环境路径")
                    }} title={"信息"}/></span>}
                              titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={env_path_dir_add}/>
                                  <ActionButton icon={"save"} title={t("保存")} onClick={update_env_path}/></div>}>
                        <Table headers={env_path_dir_headers} rows={env_path_dir_rows.map((item, index) => {
                            const new_list = [
                                <div>{index}</div>,
                                <InputText value={item.path} handleInputChange={(value) => {
                                    item.path = value;
                                }} no_border={true}/>,
                                <Select value={!!item.open} onChange={(value: any) => {
                                    item.open = (value === true || value === "true")
                                    set_env_path_dir_rows([...env_path_dir_rows])
                                }} options={[{title: t("是"), value: true}, {title: t("否"), value: false}]}
                                        no_border={true}/>,
                                <InputText value={item.note} handleInputChange={(value) => {
                                    item.note = value;
                                }} no_border={true}/>,
                                <ActionButton icon={"delete"} title={t("删除")}
                                              onClick={() => env_path_dir_del(index)}/>,
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </CardFull>
                    <Card self_title={<span className={" div-row "}><h2>{t("PTY CMD")}</h2>
                    <ActionButton icon={"info"} onClick={() => {
                        soft_ware_info_click("pty")
                    }} title={"信息"}/></span>}
                          rightBottomCom={<ButtonText text={t('更新')} clickFun={save_pty_cmd}/>}>
                        <InputText placeholder={t('cmd need pty env')} value={pty_cmd} handleInputChange={(value) => {
                            set_pty_cmd(value)
                        }}/>
                    </Card>


                </Dashboard>

            </Column>

            <Column>
                <Dashboard>
                    <CardFull self_title={<span className={" div-row "}><h2>{t("系统保护路径")}</h2> <ActionButton
                        icon={"info"} onClick={() => {
                        soft_ware_info_click("保护目录")
                    }} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")}
                                                                             onClick={protection_sys_dir_add}/><ActionButton
                        icon={"save"} title={t("保存")} onClick={protection_sys_dir_save}/></div>}>
                        <Table headers={protection_dir_headers} rows={protection_sys_dir_rows.map((item, index) => {
                            const new_list = [
                                <div>{index}</div>,
                                <InputText value={item.path} handleInputChange={(value) => {
                                    item.path = value;
                                }} no_border={true}/>,
                                <InputText value={item.note} handleInputChange={(value) => {
                                    item.note = value;
                                }} no_border={true}/>,
                                <ActionButton icon={"delete"} title={t("删除")}
                                              onClick={() => protection_sys_dir_del(index)}/>,
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </CardFull>

                    <CardFull title={t("外部软件")} titleCom={<ActionButton icon={"save"} title={t("保存")}
                                                                            onClick={save_outside_software}/>}>
                        <Table headers={headers_outside_software} rows={rows_outside_software.map((item, index) => {
                            const new_list = [
                                <div>{item.id}</div>,
                                <StatusCircle ok={item.installed}/>,
                                <InputText value={item.path} handleInputChange={(value) => {
                                    item.path = value;
                                }} no_border={true} placeholder={t("默认使用环境变量")}/>,
                                <ActionButton icon={"info"} onClick={() => {
                                    soft_ware_info_click(item.id)
                                }} title={"信息"}/>
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </CardFull>
                </Dashboard>
            </Column>

        </Row></React.Fragment>)
}
