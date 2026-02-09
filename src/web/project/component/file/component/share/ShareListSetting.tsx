import React, {useEffect, useState} from "react";
import {RowColumn} from "../../../../../meta/component/Dashboard";
import {CardFull} from "../../../../../meta/component/Card";
import {ActionButton} from "../../../../../meta/component/Button";
import {Table} from "../../../../../meta/component/Table";
import {InputText, Select} from "../../../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {file_share_item} from "../../../../../../common/req/file.req";
import {settingHttp} from "../../../../util/config";
import {RCode} from "../../../../../../common/Result.pojo";
import {NotySucess} from "../../../../util/noty";
import {routerConfig} from "../../../../../../common/RouterConfig";
import {copyToClipboard} from "../../../../util/FunUtil";
import Header from "../../../../../meta/component/Header";
import {useNavigate} from "react-router-dom";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../../util/store";


// 分享列表设置
export default function ShareListSetting() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();

    const headers = [t("编号"),t("路径"),t("过期小时"),t("token"),t("备注"),t("剩余时间(h)"),t("下载次数")];
    const [rows,set_rows] = useState<file_share_item>([]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const add = ()=>{
        set_rows([...rows,{note:"",path:""}]);
    }
    const get_items = async () => {
        const result = await settingHttp.get("get_share_file_list");
        if (result.code === RCode.Sucess) {
            const  p:file_share_item[] = result.data ?? []
            const now = Date.now();
            for (const i of p) {
                try {
                    if (i.left_hour != null && i.left_hour > 0) {
                        const pastMs = now - i.time_stamp;  // 已过去毫秒
                        const leftMs = i.left_hour * 3600000 - pastMs; // 剩余毫秒
                        i.show_left_hour = parseFloat((leftMs / 3600000).toFixed(2)); // 转回小时
                    } else {
                        i.show_left_hour = i.left_hour
                    }
                } catch(err) {
                }
            }
            set_rows(p);
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
    const info_click = ()=>{
        let context = <div>
            小时设置为-1或者不设置就没有过期时间
        </div>;
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }
    return <div className="common-box ">
        <Header>
            <ActionButton icon={"arrow_back"} title={t("上一页")} onClick={()=>{
                navigate(-1);
            }}/>
        </Header>
        <RowColumn  widthPer={70} >
            <CardFull self_title={<span className={" div-row "}><h2>{t("文件分享列表")}</h2>
            <ActionButton icon={"info"} title={t("提示")} onClick={info_click}/>
            </span>}
                      titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={save}/></div>}>
                <Table headers={headers} rows={rows.map((item:file_share_item, index) => {
                    const new_list = [
                        <div>
                            {index}
                        </div>,
                        <InputText value={item.path} handleInputChange={(value) => {
                            item.path = value;
                        }} no_border={true}/>,
                        <InputText value={item.left_hour} handleInputChange={(value) => {
                            item.left_hour = parseFloat(value);
                            item.time_stamp = Date.now()
                        }} no_border={true}/>,
                        <InputText value={item.token} handleInputChange={(value) => {
                            item.token = value;
                        }} no_border={true}/>,
                        <InputText value={item.note} handleInputChange={(value) => {
                            item.note = value;
                        }} no_border={true}/>,
                        <p>
                            {item.show_left_hour}
                        </p>,
                        <p>
                            {item.download_num}
                        </p>,
                        <div>
                            <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/>
                            {
                                item.id &&
                                <ActionButton icon={"content_copy"} title={t("复制地址")} onClick={() => {
                                    const url = `${window.location.origin}/${routerConfig.share}/${item.id}`
                                    copyToClipboard(url)
                                    NotySucess(url)
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