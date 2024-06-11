import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, RowColumn} from "../../../../meta/component/Dashboard";
import {CardFull} from "../../../../meta/component/Card";
import {ActionButton} from "../../../../meta/component/Button";
import {InputText} from "../../../../meta/component/Input";
import {Table} from "../../../../meta/component/Table";



const headers = ["路由", "文件|http路径", "备注", "删除"];

export function TableListRender(props: {
    getItems?: () => Promise<{ url?: string, name?: string }[]>, // 获取初始化元素
    save?: (items: {}[][]) => Promise<void>, // 保存
    headers: string[],
}) {
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
    return <Dashboard>
            <CardFull title={"跳转路由"} titleCom={<div><ActionButton icon={"add"} title={"添加"} onClick={add}/><ActionButton icon={"save"} title={"保存"} onClick={save}/></div>}>
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
                        <ActionButton icon={"delete"} title={"删除"} onClick={() => del(index)}/>
                    ];
                    return new_list;
                })} width={"10rem"}/>
            </CardFull>
        </Dashboard>

}
