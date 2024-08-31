import React, {useEffect, useRef, useState} from 'react'
import {NavIndexItem} from "./NavIndexItem";
import {getByListRandom} from "../../../../../common/ListUtil";
import {InputText, InputTextIcon} from "../../../../meta/component/Input";
import {ActionButton, ButtonLittle, ButtonText} from "../../../../meta/component/Button";
import {useLocation, useNavigate} from "react-router-dom";


const colorList = ["#ffffff",
    "#fefff8",
    "#fcfdf1",
    // "#d4e3cd",
    "#d3d2dc",
    "#f8f9fd",
    "#ebf4fe",
    // "#c4bcfb",
    "#ebebeb",
    "#e8f7eb",
    "#eaf2f9"]

let indexp;
let itemp_recover;

export interface NavItem {
    key: string;
    preName: string;
}

export function NavIndexContainer(props: {
    getItems?: () => Promise<{ url?: string, name?: string }[]>,
    clickItem?: (item: any) => void,
    save?: (items: { url?: string, name?: string }[]) => Promise<void>,
    items: NavItem[];
}) {
    const [items, setItems] = useState([]);
    const location = useLocation();
    const [edit, setEdit,] = useState<boolean>(false);

    const handleDragStart = (event, index) => {
        indexp = index;
    };
    const handleronDrop = (event, index) => {
        const list = [...items];
        const itemp = list[indexp];
        list.splice(indexp, 1);//删掉原来位置
        list.splice(index, 0, itemp); //插入
        setItems(list)
    }
    const del = (idnex) => {
        const list = [...items];
        list.splice(idnex, 1);//删掉
        setItems(list)
    }
    useEffect(() => {
        const start = async () => {
            if (!props.getItems) {
                return;
            }
            const list = await props.getItems();
            list.map((v, i) => {
                v['color'] = getByListRandom(colorList);
            });
            setItems(list);
        }
        start();

    }, [location])
    const editHander = async () => {
        if (edit) {
            if (props.save) {
                await props.save(items)
            }
        } else {
            // 开启编辑
            itemp_recover = items;
        }
        setEdit(!edit)

    }
    const addItem = () => {
        const list = [...items, {name: "", url: "", color: getByListRandom(colorList)}];
        setItems(list)
    }
    const cancel = () => {
        setEdit(!edit);
        setItems(itemp_recover);
    }
    return <div className={"nav_list_div"}>
        {items.map((item, index) => (
            <div
                key={index}
                draggable
                onDragOver={(event) => {
                    event.preventDefault()
                }}
                onDragStart={(event) => handleDragStart(event, index)} //开始拖动(自己)
                // onDragEnter={(event) => handleonDragEnter(event, index)} // 进入目标元素上执行（目标元素)
                // onDragLeave={(event) => handleDragLeave(event)}
                onDrop={(event) => handleronDrop(event, index)}  // 目标元素上被释放 (目标)
                style={{cursor: !edit ? "pointer" : 'move'}}
            >
                <NavIndexItem name={item.name} {...item} div={edit} target={"_blank"} clickItem={props.clickItem}/>
                {edit && props.items.map((v,i) => (
                    <div key={i}>
                        <InputText value={item[v.key]} handleInputChange={(value) => {
                            item[v.key] = value;
                        }} placeholder={v.preName} no_border={true}/>
                    </div>
                ))}
                {edit && <ButtonText text={"删除"} clickFun={() => {
                    del(index)
                }}/>}
            </div>
        ))}
        {edit && <div style={{"display": "block"}}>
            <ActionButton title={"取消"} icon={"cancel"} onClick={cancel}/>
            <ActionButton title={"添加"} icon={"add"} onClick={addItem}/>
        </div>}
        <ActionButton icon={!edit ? "edit" : "save"} title={!edit ? "编辑" : "保存"} onClick={editHander}/>
    </div>
}
