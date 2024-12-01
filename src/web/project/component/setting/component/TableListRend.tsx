import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, RowColumn} from "../../../../meta/component/Dashboard";
import {CardFull} from "../../../../meta/component/Card";
import {ActionButton} from "../../../../meta/component/Button";
import {InputText} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";
import {useTranslation} from "react-i18next";
import {SysSoftware} from "../../../../../common/req/setting.req";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";





export function TableListRender(props: {
    getItems?: () => Promise<{ url?: string, name?: string }[]>, // 获取初始化元素
    save?: (items: {}[][]) => Promise<void>, // 保存
    headers: string[],
}) {
    const { t } = useTranslation();
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const headers = [t("路由"), `${t("文件")}|http${t("路径")}`, t("删除")];
    const [rows, setRows] = useState([]);
    const init = async () =>{
        if (props.getItems) {
            const list = await props.getItems();
            setRows(list);
        }
    }
    useEffect(() => {
        init();
    }, []);
    const add = () => {
        setRows([[], ...rows]);
    }
    const save = async () => {
        if (props.save) {
            await props.save(rows);
        }
    }
    const del = (index) => {
        rows.splice(index, 1);
        setRows([...rows]);
    }

    const soft_ware_info_click = ()=>{
        let context = <div>
            需要以 "/api" 开头的路由，会自动识别文件地址和http地址，将页面转到对应结果。
        </div>;
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }
    return <Dashboard>
            <CardFull  self_title={<span className={" div-row "}><h2>{t("页面资源路由")}</h2> <ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={save}/></div>}>
                <Table headers={props.headers} rows={rows.map((itemList, index) => {
                    const new_list = [
                        <InputText value={itemList[0]} handleInputChange={(value) => {
                            itemList[0] = value;
                        }} no_border={true}/>,
                        <InputText value={itemList[1]} handleInputChange={(value) => {
                            itemList[1] = value;
                        }} no_border={true}/>,
                        <InputText value={itemList[2]} handleInputChange={(value) => {
                            itemList[2] = value;
                        }} no_border={true}/>,
                        <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/>
                    ];
                    return new_list;
                })} width={"10rem"}/>
            </CardFull>
        </Dashboard>

}
