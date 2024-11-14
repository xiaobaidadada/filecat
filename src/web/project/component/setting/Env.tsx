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

export function Env() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [rows, setRows] = useState([]);
    const [rows_outside_software, setRows_outside_software] = useState([]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const [env_path,set_env_path] = useState("");

    const headers = [t("编号"),t("路径"), t("是否默认"), t("备注") ];
    const headers_outside_software = [t("软件"),t("是否安装"), t("路径") ];


    const getItems = async () => {
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
            set_env_path(result2.data);
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
            new Noty({
                type: 'success',
                text: '保存成功',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout: "bottomLeft"
            }).show();
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
        }
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }

    const update_env_path = async ()=>{
        const result = await settingHttp.post("env/path/save", {path:env_path});
        if (result.code === RCode.Sucess) {
            NotySucess("保存成功")
            initUserInfo();
        }
    }
    return (<Row>
        <Column widthPer={50}>
            <Dashboard>
                <CardFull title={t("文件夹路径")} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={save}/></div>}>
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
            </Dashboard>
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
        </Column>
        <Column>
            <Dashboard>
                <Card title={t("PATH路径")} rightBottomCom={<ButtonText text={t('更新')} clickFun={update_env_path}/>}>
                    <InputText placeholder={t('多个path路径使用:(linux)或者;(windwos)分割')}  value={env_path} handleInputChange={(value)=>{set_env_path(value)}} />
                </Card>
            </Dashboard>
        </Column>
    </Row>)
}