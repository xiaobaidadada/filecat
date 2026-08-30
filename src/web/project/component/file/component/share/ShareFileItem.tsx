import React, {ReactNode} from 'react';
import {FileItemData, FileTypeEnum} from "../../../../../../common/file.pojo";
import { useAtom } from 'jotai'; 
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
import {use_click_double, use_share_preview, useUpdateUrlParams} from "../../FileUtil";



export function ShareFileItem(props: FileItemData & {item_list:FileItemData[], index?: number, itemWidth?: string,share:{share_id:string,share_token:string} }) {
    const [selectList, setSelectList] = useAtom($stroe.selectedFileList);
    const [enterKey, setEnterKey] = useAtom($stroe.enterKey);
    const {click_file} = user_click_file();
    const [nowFileList, setNowFileList] = useAtom($stroe.nowFileList);
    const {t} = useTranslation();
    // 右键功能
    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const updateParams = useUpdateUrlParams();
    const share_review = use_share_preview()

    // 双击判断：同一 index 在 300ms 内连点两次视为双击（复用通用 hook，消除闭包/竞态问题）
    const {clickDouble} = use_click_double();
    const clickHandler = (index, name) => {
        const isDouble = clickDouble(index, () => {
            if (props.type === FileTypeEnum.folder) {
                // 分享目录不会有文件夹进入动作，直接 return
                return;
            }
            if (share_review(name)) return;
            click_file({file_path: props.item_list[index].path, file_url: fileHttp.getDownloadUrlV2(props.item_list[index].path, "share_download", {
                    share_id: props.share.share_id,
                    share_token: props.share.share_token
                }),
                name, size: props.origin_size, opt_shell: true, mtime: props.mtime,
                not_type_tip: t("未知类型，请下载查看")
            });
        });
        if (isDouble) return;

        // 单击：选中逻辑
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
