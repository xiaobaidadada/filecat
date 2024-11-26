import React from 'react';
import {FileItemData, FileTypeEnum} from "../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {useLocation, useNavigate} from "react-router-dom";
import {getByList, getMaxByList, getNewDeleteByList, webPathJoin} from "../../../../common/ListUtil";
import {fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import {saveTxtReq} from "../../../../common/req/file.req";
import {BaseFileItem} from "./component/BaseFileItem";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail} from "../../util/noty";
import {PromptEnum} from "../prompts/Prompt";
import {getEditModelType} from "../../../../common/StringUtil";
import {FileMenuData, getFileFormat} from "../../../../common/FileMenuType";
import {useTranslation} from "react-i18next";
import {getFileNameByLocation} from "./FileUtil";
import {user_click_file} from "../../util/store.util";


export function FileItem(props: FileItemData & { index?: number, itemWidth?: string }) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [enterKey,setEnterKey] = useRecoilState($stroe.enterKey);
    const { click_file } = user_click_file();
    const {t} = useTranslation();

    const navigate = useNavigate();
    let location = useLocation();
    // const match = useMatch('/:pre/file/*');
    const clickHandler = async (index, name) => {
        const select = getByList(selectList, index);
        if (select !== null) {
            // @ts-ignore 取消选择
            setSelectList(getNewDeleteByList(selectList, index))
            // console.log('取消')
        } else {
            if (enterKey ==="ctrl") {
                // @ts-ignore 选中
                setSelectList([...selectList, index])
            } else if(enterKey ==="shift") {
                const {max,min} = getMaxByList(selectList);
                const list:number[] = [];
                if(index >= max) {
                    for(let i=max; i<=index; i++) {
                        list.push(i);
                    }
                } else {
                    for(let i=min; i >= index; i--) {
                        list.push(i);
                    }
                }
                setSelectList(list);
            } else {
                setSelectList([index])
            }
        }

        // @ts-ignore 点击
        setClickList([...clickList, index])
        setTimeout(() => {
            // @ts-ignore 取消点击，也就是双击
            setClickList(getNewDeleteByList(clickList, index))
        }, 300)
        if (props.type === FileTypeEnum.folder) {
            // 文件夹
            const item = clickList.find(v => v === index)
            if (item !== undefined) {
                // 双击文件夹
                // debugger;
                navigate(webPathJoin(location.pathname, name))
                setSelectList([])
                setClickList([])
                return;
            }
        } else {
            // 文件
            const item = clickList.find(v => v === index)
            if (item !== undefined) {
                click_file({name});
            }
        }
    }

    // 右键功能
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);


    const handleContextMenu = (event, name, isDir) => {
        event.preventDefault();
        const pojo = new FileMenuData();
        pojo.path = webPathJoin(location.pathname, name)
        pojo.filename = name;
        pojo.x = event.clientX;
        pojo.y = event.clientY;
        pojo.type = isDir ? FileTypeEnum.folder : getFileFormat(name);
        setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
    };


    return <BaseFileItem extraAttr={{
        onContextMenu: (event) => {
            handleContextMenu(event, props.name, props.type === FileTypeEnum.folder)
        }
    }} name={props.name} index={props.index} mtime={props.mtime} size={props.size} type={props.type}
                         isLink={props.isLink} path={props.path}
                         click={clickHandler} itemWidth={props.itemWidth}>
    </BaseFileItem>
}
