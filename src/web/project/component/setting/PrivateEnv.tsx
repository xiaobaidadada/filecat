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
import {using_env_prompt} from "./util";
export function PrivateEnv() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [rows, setRows] = useState([]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const [protection_dir_rows,set_protection_dir_rows] = useState([]);
    const [quick_cmd_rows,set_quick_cmd_rows] = useState([] as QuickCmdItem[]);
    const [file_quick_cmd_rows,set_file_quick_cmd_rows] = useState([] as FileQuickCmdItem[]);

    const headers = [t("编号"),t("路径"), t("是否默认"), t("备注") ];
    const protection_dir_headers = [t("编号"),t("路径"),t("备注")];
    const quick_cmd_headers = [t("编号"),t("命令"),t("父编号"),t("备注")];
    const file_quick_cmd_headers = [t("文件后缀"),t("命令"),t("其他参数"),t("备注")];



    const getItems = async () => {
        // 文件夹根路径
        const result = await settingHttp.get("filesSetting");
        if (result.code === RCode.Success) {
            setRows(result.data.dirs);
            set_quick_cmd_rows(result.data.quick_cmd);
            set_file_quick_cmd_rows(result.data.file_quick_cmd);
        }


        // 个人保护目录
        const result3 = await settingHttp.get("protection_dir");
        if (result3.code === RCode.Success) {
            set_protection_dir_rows(result3.data ?? []);
        }



    }
    useEffect(() => {
        getItems();
    }, []);


    // 文件目录
    const save = async () => {
        for (let i =0; i<rows.length;i++) {
            rows[i].index = i;
        }
        const result = await settingHttp.post("filesSetting/save", {dirs:rows});
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            reloadUserInfo();
        }
    }
    const quick_cmd_save = async () => {
        // for (let i =0; i<quick_cmd_rows.length;i++) {
        //     if(quick_cmd_rows[i].index !== undefined) {
        //         quick_cmd_rows[i].index = parseInt(quick_cmd_rows[i].index)
        //     }
        //     if(quick_cmd_rows[i].father_index !== undefined) {
        //         quick_cmd_rows[i].father_index = parseInt(quick_cmd_rows[i].father_index)
        //     }
        // }
        const result = await settingHttp.post("filesSetting/save", {quick_cmd:quick_cmd_rows});
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            // reloadUserInfo();
            initUserInfo();
        }
    }
    const file_quick_cmd_save = async () => {
        const result = await settingHttp.post("filesSetting/save", {file_quick_cmd:file_quick_cmd_rows});
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            initUserInfo();
        }
    }
    // 保护目录保存
    const protection_dir_save = async () => {
        const result = await settingHttp.post("protection_dir/save", protection_dir_rows);
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            reloadUserInfo();
        }
    }

    const add = ()=>{
        setRows([...rows,{note:"",default:false,path:""}]);
    }
    const del = (index) => {
        rows.splice(index, 1);
        setRows([...rows]);
    }
    const protection_dir_add = ()=>{
        set_protection_dir_rows([...protection_dir_rows,{path:"",note:""}]);
    }

    const quick_cmd_add = ()=>{
        set_quick_cmd_rows([...quick_cmd_rows,{cmd:"",note:""}]);
    }
    const file_quick_cmd_add = ()=>{
        set_file_quick_cmd_rows([...file_quick_cmd_rows,{cmd:"",note:"",file_suffix:"",params:""}]);
    }

    const protection_dir_del = (index)=>{
        protection_dir_rows.splice(index, 1);
        set_protection_dir_rows([...protection_dir_rows]);
    }

    const quick_cmd_del = (index)=>{
        quick_cmd_rows.splice(index, 1);
        set_quick_cmd_rows([...quick_cmd_rows]);
    }
    const file_quick_cmd_del = (index)=>{
        file_quick_cmd_rows.splice(index, 1);
        set_file_quick_cmd_rows([...file_quick_cmd_rows]);
    }

    const onChange = (item,value,index)=> {
        const list = [];
        for (let i=0; i<rows.length; i++) {
            if (i !== index) {
                rows[i].default = false;
            } else {
                rows[i].default = value === "true";
            }
            list.push(rows[i])
        }
        // setRows([]);
        setRows(list);
    }


    // 外部软件信息解释
    const soft_ware_info_click =  using_env_prompt();

    return (<React.Fragment>
        <Row>
            <Column>
                <Dashboard>
                    <CardFull self_title={<span className={" div-row "}><h2>{t("文件夹路径")}</h2> <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click("文件夹路径")}} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={save}/></div>}>
                        <Table headers={headers} rows={rows.map((item, index) => {
                            const new_list = [
                                <div>{index}</div>,
                                <InputText value={item.path} handleInputChange={(value) => {
                                    item.path = value;
                                }} no_border={true}/>,
                                <Select value={item.default} onChange={(value) => {
                                    onChange(item,value,index);
                                }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                                <InputText value={item.note} handleInputChange={(value) => {
                                    item.note = value;
                                }} no_border={true}/>,
                                <div>
                                    {index!==0 && <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/> }
                                </div>,
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </CardFull>
                    <CardFull self_title={<span className={" div-row "}><h2>{t("个人保护路径")}</h2> <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click("保护目录")}} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={protection_dir_add}/><ActionButton icon={"save"} title={t("保存")} onClick={protection_dir_save}/></div>}>
                        <Table headers={protection_dir_headers} rows={protection_dir_rows.map((item, index) => {
                            const new_list = [
                                <div>{index}</div>,
                                <InputText value={item.path} handleInputChange={(value) => {
                                    item.path = value;
                                }} no_border={true}/>,
                                <InputText value={item.note} handleInputChange={(value) => {
                                    item.note = value;
                                }} no_border={true}/>,
                                <ActionButton icon={"delete"} title={t("删除")} onClick={() => protection_dir_del(index)}/> ,
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </CardFull>
                </Dashboard>
            </Column>
        <Column>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}><h2>{t("目录快捷命令")}</h2>
                    <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click("目录快捷命令")}}
                           title={"info"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={quick_cmd_add}/>
                    <ActionButton icon={"save"} title={t("保存")} onClick={quick_cmd_save}/>
                </div>}>
                    <Table headers={quick_cmd_headers} rows={quick_cmd_rows.map((item, index) => {
                        const new_list = [
                            <InputText value={item.index} handleInputChange={(value) => {
                                item.index = value;
                            }} no_border={true}/>,
                            <InputText value={item.cmd} handleInputChange={(value) => {
                                item.cmd = value;
                            }} no_border={true}/>,
                            <InputText value={item.father_index} handleInputChange={(value) => {
                                item.father_index = value;
                            }} no_border={true}/>,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <ActionButton icon={"delete"} title={t("删除")} onClick={() => quick_cmd_del(index)}/> ,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>

                <CardFull self_title={<span className={" div-row "}><h2>{t("文件快捷命令")}</h2>
                    <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click("文件快捷命令")}}
                                  title={"info"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={file_quick_cmd_add}/>
                    <ActionButton icon={"save"} title={t("保存")} onClick={file_quick_cmd_save}/>
                </div>}>
                    <Table headers={file_quick_cmd_headers} rows={file_quick_cmd_rows.map((item, index) => {
                        const new_list = [
                            <InputText value={item.file_suffix} handleInputChange={(value) => {
                                item.file_suffix = value;
                            }} no_border={true}/>,
                            <InputText value={item.cmd} handleInputChange={(value) => {
                                item.cmd = value;
                            }} no_border={true}/>,
                            <InputText value={item.params} handleInputChange={(value) => {
                                item.params = value;
                            }} no_border={true}/>,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <ActionButton icon={"delete"} title={t("删除")} onClick={() => file_quick_cmd_del(index)}/> ,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>
        </Column>
    </Row></React.Fragment>)
}
