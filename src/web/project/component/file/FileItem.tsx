import React from 'react';
import {FileItemData, FileTypeEnum} from "../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {useLocation, useNavigate} from "react-router-dom";
import {getByList, getMaxByList, getNewDeleteByList, webPathJoin} from "../../../../common/ListUtil";
import {fileHttp} from "../../util/config";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {BaseFileItem} from "./component/BaseFileItem";
import {RCode} from "../../../../common/Result.pojo";
import {PromptEnum} from "../prompts/Prompt";
import {FileMenuData, getFileFormat} from "../../../../common/FileMenuType";
import {useTranslation} from "react-i18next";
import {user_click_file} from "../../util/store.util";
import {getFileNameByLocation, getFilesByIndexs} from "./FileUtil";


export function FileItem(props: FileItemData & { index?: number, itemWidth?: string }) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [confirm, set_confirm] = useRecoilState($stroe.confirm);

    const [enterKey, setEnterKey] = useRecoilState($stroe.enterKey);
    const {click_file} = user_click_file();
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
            if (enterKey === "ctrl") {
                // @ts-ignore 选中
                setSelectList([...selectList, index])
            } else if (enterKey === "shift") {
                const {max, min} = getMaxByList(selectList);
                const list: number[] = [];
                if (index >= max) {
                    for (let i = max; i <= index; i++) {
                        list.push(i);
                    }
                } else {
                    for (let i = min; i >= index; i--) {
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
                navigate(webPathJoin(getRouterPath(), name))
                setSelectList([])
                setClickList([])
                setNowFileList({files: [], folders: []});
                return;
            }
        } else {
            // 文件
            const item = clickList.find(v => v === index)
            if (item !== undefined) {
                click_file({name, size: props.origin_size, opt_shell: true,mtime:props.mtime});
            }
        }
    }

    // 右键功能
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);


    const handleContextMenu = (event, name, isDir, size) => {
        event.preventDefault();
        event.stopPropagation(); // 阻止事件冒泡
        const pojo = new FileMenuData();
        pojo.path = webPathJoin(getRouterPath(), name)
        pojo.filename = name;
        pojo.x = event.clientX;
        pojo.y = event.clientY;
        pojo.type = isDir ? FileTypeEnum.folder : getFileFormat(name);
        pojo.size = size;
        setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
    };
    const draggable_handle = async ( to: string) => {
        const files = getFilesByIndexs(nowFileList, selectList);
        const up_files = files.map(file=>getFileNameByLocation(file.name));
        const rsp = await fileHttp.post('cut', {
            files: up_files,
            to:`${getRouterAfter('file',getRouterPath())}/${to}`
        });
        setSelectList([])
        set_confirm({open:false,handle:null});
        navigate(getRouterPath())
    }

    return <BaseFileItem extraAttr={{
        onContextMenu: (event) => {
            handleContextMenu(event, props.name, props.type === FileTypeEnum.folder, props.origin_size)
        }
    }} draggable_handle={draggable_handle} name={props.name} index={props.index} mtime={props.mtime} size={props.size} type={props.type}
                         isLink={props.isLink} path={props.path} icon={props.icon} show_mtime={props.show_mtime}
                         click={clickHandler} itemWidth={props.itemWidth}>
    </BaseFileItem>
}
