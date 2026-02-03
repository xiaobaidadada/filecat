import React, {useEffect, useState} from "react";
import {RowColumn} from "../../../../meta/component/Dashboard";
import {CardFull} from "../../../../meta/component/Card";
import {ActionButton} from "../../../../meta/component/Button";
import {Table} from "../../../../meta/component/Table";
import {InputText, Select} from "../../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {file_share_item} from "../../../../../common/req/file.req";
import {settingHttp} from "../../../util/config";
import {RCode} from "../../../../../common/Result.pojo";
import {NotySucess} from "../../../util/noty";
import {routerConfig} from "../../../../../common/RouterConfig";
import {copyToClipboard} from "../../../util/FunUtil";


// 分享列表设置
export default function ShareListSetting() {
    const { t, i18n } = useTranslation();

    const headers = [t("编号"),t("路径"),t("剩余过期时间(h)"),t("token"),t("备注")];
    const [rows,set_rows] = useState<file_share_item>([]);
    const add = ()=>{
        set_rows([...rows,{note:"",path:""}]);
    }
    const get_items = async () => {
        const result = await settingHttp.get("get_share_file_list");
        if (result.code === RCode.Sucess) {
            set_rows(result.data ?? []);
        }
    }
    useEffect(()=>{
        get_items();
    },[])
    const save = async ()=>{
        const result = await settingHttp.post("set_share_file_list", rows);
        if (result.code === RCode.Sucess) {
            NotySucess("保存成功")
            get_items()
        }
    }
    const del = (index)=>{
        rows.splice(index, 1);
        set_rows([...rows]);
    }
    return <div className="common-box ">
        <RowColumn  widthPer={70} >
            <CardFull self_title={<span className={" div-row "}><h2>{t("文件分享列表")}</h2> </span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={save}/></div>}>
                <Table headers={headers} rows={rows.map((item:file_share_item, index) => {
                    const new_list = [
                        <div>
                            {index}
                        </div>,
                        <InputText value={item.path} handleInputChange={(value) => {
                            item.path = value;
                        }} no_border={true}/>,
                        <InputText value={item.left_hour} handleInputChange={(value) => {
                            item.left_hour = parseInt(value);
                        }} no_border={true}/>,
                        <InputText value={item.token} handleInputChange={(value) => {
                            item.token = value;
                        }} no_border={true}/>,
                        <InputText value={item.note} handleInputChange={(value) => {
                            item.note = value;
                        }} no_border={true}/>,
                        <div>
                            <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/>
                            {
                                item.id &&
                                <ActionButton icon={"content_copy"} title={t("复制地址")} onClick={() => {
                                    const url = `${window.location.origin}/${routerConfig.share}/${item.id}`
                                    copyToClipboard(url)
                                }}/>
                            }
                        </div>
                    ];
                    return new_list;
                })} width={"10rem"}/>
            </CardFull>
        </RowColumn>
    </div>

}