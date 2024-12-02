import React, {useEffect, useRef, useState} from 'react'
import {NavIndexItem} from "./NavIndexItem";
import {getByListRandom, getNewDeleteByList} from "../../../../../common/ListUtil";
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

// 用于展示的
export interface NavItem {
    key: string; // 值的key 注意不能设置为 NavIndexItem 中的 预设值key
    preName: string; // 预览值
}

export interface SiteIndexItem {
    name: string; // 是必须含有的key
    color?: string; // 也是必须含有的 颜色 随机自动添加的
    _children?: SiteIndexItem[];
    _type?: string & 'dir'|'';
    [key:string]: any; // 其他任意取于 NavItem 里的key
}

let rootList: SiteIndexItem[] = [];

const last_queue:SiteIndexItem [] = [];

export function NavIndexContainer(props: {
    getItems?: () => Promise<SiteIndexItem[]>,
    clickItem?: (item: any) => void,
    save?: (items: { url?: string, name?: string }[]) => Promise<void>,
    items: NavItem[];
}) {
    const [items, setItems] = useState([] as SiteIndexItem[]);
    const [last_queue_index,set_last_queue_index] = useState<number>(-1);
    const location = useLocation();
    const [edit, setEdit,] = useState<boolean>(false);
    const [unfold,set_unfold] = useState<boolean>(false);

    const [edit_index, setEdit_index] = useState<number[]>([]);

    const handleDragStart = (event, index) => {
        indexp = index;
    };
    const update_list = (list:SiteIndexItem[])=> {
        if (last_queue_index !== -1) {
            last_queue[last_queue_index]._children = list;
        } else {
            rootList = list;
        }
    }
    const handleronDrop = (event, index) => {
        const list = [...items];
        const itemp = list[indexp];
        list.splice(indexp, 1);//删掉原来位置
        list.splice(index, 0, itemp); //插入
        update_list(list);
        setItems(list)
    }
    const del = (idnex) => {
        const list = [...items];
        list.splice(idnex, 1);//删掉
        update_list(list);
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
            rootList = list;
            setItems(rootList);
        }
        start();

    }, [location])
    const editHander = async () => {
        if (edit) {
            if (props.save) {
                await props.save(rootList)
            }
        } else {
            // 开启编辑
            itemp_recover = items;
        }
        setEdit(!edit)

    }
    const addItem = () => {
        const list = [...items, {name: "",  color: getByListRandom(colorList)}];
        update_list(list);
        setItems(list)
    }
    const addDirItem = () => {
        const list = [...items, {name: "",_type:"dir",_children:[],  color: getByListRandom(colorList)}];
        update_list(list);
        setItems(list)
    }
    const cancel = () => {
        setEdit_index([]);
        setEdit(false);
        setItems(itemp_recover);
        set_unfold(false)
    }
    const click_dir = (item:SiteIndexItem)=>{
        set_last_queue_index(last_queue_index+1);
        setItems(item._children);
        last_queue.push(item)
    }
    const back_last = ()=> {
        if(last_queue_index ===0) {
            setItems(rootList);
        } else {
            setItems(last_queue[last_queue_index -1]._children);
        }
        set_last_queue_index(last_queue_index -1);
        last_queue.pop();
    }
    return <div className={"nav_list_div"}>
        {last_queue_index!==-1 && <ActionButton title={"返回"} icon={"arrow_back"} onClick={back_last}/>}
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
                <NavIndexItem name={item.name} item={item} {...item} div={edit} target={"_blank"} click_dir={click_dir} clickItem={props.clickItem}/>
                {edit && (edit_index.find(v => v === index) !== undefined || unfold) && <div className={!unfold ?' site_edit ':''}>
                    { item._type === "dir" ?
                        <InputText value={item.name} handleInputChange={(value) => {
                            item.name = value;
                        }} placeholder={"输入类目名"} no_border={true}/>
                        :
                        (props.items.map((v, i) => (
                            <div key={i}>
                                <InputText value={item[v.key]} handleInputChange={(value) => {
                                    item[v.key] = value;
                                }} placeholder={v.preName} no_border={true}/>
                            </div>
                        )))
                    }
                    {!unfold && <ButtonText text={"折叠"} clickFun={() => {
                        setEdit_index(getNewDeleteByList(edit_index,index));
                    }}/>}
                </div>}
                {edit && <div style={{"display": "block"}} >
                    <span className={"div-row "}>
                        <ButtonText text={"删除"} clickFun={() => {
                            del(index)
                        }}/>
                    <ButtonText text={"编辑"} clickFun={() => {
                        if (edit_index.find(v => v === index) !== undefined) {
                            return;
                        }
                        setEdit_index([...edit_index, index])
                    }}/>
                    </span>

                </div>}
            </div>
            ))}
        {edit && <div style={{"display": "block"}}>
            <ActionButton title={"取消"} icon={"cancel"} onClick={cancel}/>
            <ActionButton title={"添加"} icon={"add"} onClick={addItem}/>
            <ActionButton title={"添加类目"} icon={"add_box"} onClick={addDirItem}/>
            <ActionButton title={"全部编辑"} icon={unfold?"unfold_less":'unfold_more'} onClick={()=>{set_unfold(!unfold)}}/>
        </div>}
        <ActionButton icon={!edit ? "edit" : "save"} title={!edit ? "编辑" : "保存"} onClick={editHander}/>
    </div>
}
