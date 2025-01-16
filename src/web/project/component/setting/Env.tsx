import React, {useContext, useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Table} from "../../../meta/component/Table";
import {InputText, Select} from "../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {SysSoftware, TokenSettingReq} from "../../../../common/req/setting.req";
import {GlobalContext} from "../../GlobalProvider";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {NotySucess} from "../../util/noty";
import {use_auth_check} from "../../util/store.util";

export function Env() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [rows, setRows] = useState([]);
    const [rows_outside_software, setRows_outside_software] = useState([]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    // const [env_path,set_env_path] = useState("");
    const [protection_dir_rows,set_protection_dir_rows] = useState([]);
    const [env_path_dir_rows,set_env_path_dir_rows] = useState([]);

    const headers = [t("编号"),t("路径"), t("是否默认"), t("备注") ];
    const headers_outside_software = [t("软件"),t("是否安装"), t("路径") ];
    const protection_dir_headers = [t("编号"),t("路径"),t("备注")];
    const env_path_dir_headers = [t("编号"),t("路径"),t("备注")];
    const {check_user_auth} = use_auth_check();

    const getItems = async () => {
        // 文件夹根路径
        const result = await settingHttp.get("filesSetting");
        if (result.code === RCode.Sucess) {
            setRows(result.data);
        }
        const result1 = await settingHttp.get("outside/software/get");
        if (result1.code === RCode.Sucess) {
            setRows_outside_software(result1.data);
        }
        // env path
        const result2 = await settingHttp.get("env/path/get");
        if (result2.code === RCode.Sucess) {
            set_env_path_dir_rows(result2.data);
        }
        // 保护目录
        const result3 = await settingHttp.get("protection_dir");
        if (result3.code === RCode.Sucess) {
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
        const result = await settingHttp.post("filesSetting/save", rows);
        if (result.code === RCode.Sucess) {
            NotySucess("保存成功")
            reloadUserInfo();
        }
    }
    // 保护目录保存
    const protection_dir_save = async () => {
        const result = await settingHttp.post("protection_dir/save", protection_dir_rows);
        if (result.code === RCode.Sucess) {
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
    const protection_dir_del = (index)=>{
        protection_dir_rows.splice(index, 1);
        set_protection_dir_rows([...protection_dir_rows]);
    }
    const env_path_dir_add = ()=>{
        set_env_path_dir_rows([...env_path_dir_rows,{path:"",note:""}]);
    }
    const env_path_dir_del = (index)=>{
        env_path_dir_rows.splice(index, 1);
        set_env_path_dir_rows([...env_path_dir_rows]);
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
        setRows([]);
        setRows(list);
    }
    // 外部软件
    const save_outside_software = async () => {
        const result = await settingHttp.post("outside/software/save", rows_outside_software);
        if (result.code === RCode.Sucess) {
            NotySucess("保存成功")
            initUserInfo();
        }
    }

    // 外部软件信息解释
    const soft_ware_info_click = (id)=>{
        let context;
        if(id === SysSoftware.ffmpeg) {
            context = <div>
                视频转换，rtsp播放器等媒体功能都需要这个软件。linux下你可以使用apt或者yum来安装，或者直接输入软件的位置
            </div>
        } else if (id === SysSoftware.smartmontools) {
            context = <div>
                磁盘检查需要这个软件。linux下你可以使用apt或者yum来安装，或者直接输入软件的位置。
            </div>
        } else if (id === SysSoftware.ntfs_3g) {
            context = <div>
                如果在linux需要挂载ntfs的硬盘，需要这个软件支持。
            </div>
        } else if(id === "保护目录") {
            context = <div>
                在删除的时候保护目录会拒绝删除。
                <ul>
                    <li>可以使用 /* 来表达该目录下所有文件都禁止删除</li>
                </ul>
            </div>
        } else if (id === "文件夹路径") {
            context = <div>
                用于在文件夹下切换根目录
            </div>
        } else if(id === "环境路径") {
            context = <div>
                当在不同用户环境下运行的时候由于没有执行终端去加载PATH，这里可以添加额外的PATH路径
            </div>
        }
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }

    const update_env_path = async ()=>{
        const result = await settingHttp.post("env/path/save", {paths:env_path_dir_rows});
        if (result.code === RCode.Sucess) {
            NotySucess("保存成功")
            initUserInfo();
        }
    }
    return (<Row>
        <Column widthPer={50}>
            <Dashboard>
                <CardFull title={t("外部软件")} titleCom={<ActionButton icon={"save"} title={t("保存")} onClick={save_outside_software}/>}>
                    <Table headers={headers_outside_software} rows={rows_outside_software.map((item, index) => {
                        const new_list = [
                            <div>{item.id}</div>,
                            <StatusCircle ok={item.installed} />,
                            <InputText value={item.path} handleInputChange={(value) => {
                                item.path = value;
                            }} no_border={true} placeholder={t("默认使用环境变量")}/>,
                            <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click(item.id)}} title={"信息"}/>
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>
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
                <CardFull self_title={<span className={" div-row "}><h2>{t("保护路径")}</h2> <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click("保护目录")}} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={protection_dir_add}/><ActionButton icon={"save"} title={t("保存")} onClick={protection_dir_save}/></div>}>
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
                <CardFull self_title={<span className={" div-row "}><h2>{t("PATH")}</h2>
                    <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click("环境路径")}} title={"信息"}/></span>}
                          titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={env_path_dir_add}/>
                              <ActionButton icon={"save"} title={t("保存")} onClick={update_env_path}/></div>}>
                    <Table headers={env_path_dir_headers} rows={env_path_dir_rows.map((item, index) => {
                        const new_list = [
                            <div>{index}</div>,
                            <InputText value={item.path} handleInputChange={(value) => {
                                item.path = value;
                            }} no_border={true}/>,
                            <InputText value={item.note} handleInputChange={(value) => {
                                item.note = value;
                            }} no_border={true}/>,
                            <ActionButton icon={"delete"} title={t("删除")} onClick={() => env_path_dir_del(index)}/> ,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>
        </Column>
    </Row>)
}