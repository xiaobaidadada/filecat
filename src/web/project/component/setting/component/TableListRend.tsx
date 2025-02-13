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
    info_click?:()=>void,
    title:string
}) {
    const { t } = useTranslation();

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
        const list = [];
        for (let i=0;i<props.headers.length-1;i++) {
            list.push('');
        }
        setRows([list, ...rows]);
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

    return <Dashboard>
            <CardFull  self_title={<span className={" div-row "}><h2>{props.title}</h2>
                {props.info_click && <ActionButton icon={"info"} onClick={()=>{props.info_click()}} title={"信息"}/>}
            </span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={save}/></div>}>
                <Table headers={props.headers} rows={rows.map((itemList, index) => {
                    const list = [];
                    for (let i=0;i<props.headers.length;i++) {
                        list.push(<InputText value={itemList[i]} handleInputChange={(value) => {
                            itemList[i] = value;
                            setRows([...rows]);
                        }} no_border={true}/>)
                    }
                    list.push(<ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/>)
                    return list;
                })} width={"10rem"}/>
            </CardFull>
        </Dashboard>

}
