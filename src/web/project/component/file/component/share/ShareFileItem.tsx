import React, {ReactNode} from 'react';
import {FileItemData, FileTypeEnum} from "../../../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../../util/store";
import {useNavigate} from "react-router-dom";
import {getByList, getMaxByList, getNewDeleteByList, webPathJoin} from "../../../../../../common/ListUtil";
import {BaseFileItem} from "../BaseFileItem";
import {editor_data, user_click_file} from "../../../../util/store.util";
import {fileHttp} from "../../../../util/config";
import {useTranslation} from "react-i18next";
import {FileMenuData, getFileFormat} from "../../../../../../common/FileMenuType";
import {getRouterPath} from "../../../../util/WebPath";
import {PromptEnum} from "../../../prompts/Prompt";



export function ShareFileItem(props: FileItemData & {item_list:FileItemData[], index?: number, itemWidth?: string,share:{share_id:string,share_token:string} }) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [enterKey, setEnterKey] = useRecoilState($stroe.enterKey);
    const {click_file} = user_click_file();
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const {t} = useTranslation();
    // 右键功能
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);

    const clickHandler = async (index, name) => {
        const select = getByList(selectList, index);
        if (select !== null) {
            setSelectList(getNewDeleteByList(selectList, index))
        } else {
            if (enterKey === "ctrl") {
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

        setClickList([...clickList, index])
        setTimeout(() => {
            setClickList(getNewDeleteByList(clickList, index))
        }, 300)
        if (props.type === FileTypeEnum.folder) {
            // 不会有文件夹 分享目录 只会分享目录中的文件
            return;
        } else {
            // 文件
            const item = clickList.find(v => v === index)
            if (item !== undefined) {
                // console.log(props.item_list[item])
                // return
                click_file({file_path: props.item_list[item].path, file_url: fileHttp.getDownloadUrlV2(props.item_list[item].path,"share_download", {
                        share_id: props.share.share_id,
                        share_token: props.share.share_token
                    }),
                    name, size: props.origin_size, opt_shell: true, mtime: props.mtime,
                    not_type_tip:t("未知类型，请下载查看")
                });
            }
        }
    }

    const handleContextMenu = (event, name, isDir, size) => {
        event.preventDefault();
        event.stopPropagation(); // 阻止事件冒泡
        const pojo = new FileMenuData();
        const list = props.item_list
        for (const item of list) {
            if(item.name === name) {
                // 文件不可能重名
                pojo.path = item.path;
                break;
            }
        }
        pojo.is_share = true;
        pojo.filename = name;
        pojo.x = event.clientX;
        pojo.y = event.clientY;
        pojo.type = isDir ? FileTypeEnum.folder : getFileFormat(name);
        pojo.size = size;
        pojo.share_token = props.share.share_token;
        pojo.share_id = props.share.share_id;
        setShowPrompt({show: true, type: PromptEnum.FileMenu, overlay: false, data: pojo});
    };

    return <BaseFileItem extraAttr={{
        onContextMenu: (event) => {
            handleContextMenu(event, props.name, props.type === FileTypeEnum.folder, props.origin_size)
        }
    }} name={props.name} index={props.index} mtime={props.mtime} size={props.size} type={props.type}
                         itemWidth={props.itemWidth} show_mtime={props.show_mtime}
                         click={clickHandler}/>
}
