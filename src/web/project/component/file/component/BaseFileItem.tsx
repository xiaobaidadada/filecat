import React, {ReactNode} from 'react';
import {FileItemData, FileTypeEnum} from "../../../../../common/file.pojo";
import { useAtom } from 'jotai'; 
import {getByList} from "../../../../../common/ListUtil";
import {$stroe} from "../../../util/store";
import {fileHttp, userHttp} from "../../../util/config";
import {FileListPaginationModeEmum, UserData} from "../../../../../common/req/user.req";
import {RCode} from "../../../../../common/Result.pojo";
import {NotyFail, NotySuccess} from "../../../util/noty";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {useNavigate} from "react-router-dom";
import {getFileNameByLocation, getFilesByIndexs} from "../FileUtil";
import {Icon} from "../../../../meta/component/Button";
import {useTranslation} from "react-i18next";


export function BaseFileItem(props: FileItemData & {
    extraAttr?: any,
    index?: number;
    click: (index: number, name: string) => void,
    itemWidth?: string,
    children?: React.ReactNode,
    draggable_handle?: (to:string) => any // 拖拽文件到另一个地方
}) {
    const [selectList, setSelectList] = useAtom($stroe.selectedFileList);
    const [nowFileList, setNowFileList] = useAtom($stroe.nowFileList);

    const [showPrompt, setShowPrompt] = useAtom($stroe.confirm);
    const [user_base_info, setUser_base_info] = useAtom($stroe.user_base_info);
    const {t} = useTranslation();

    async function click(index: number) {
        if (props.click) {
            props.click(index, props.name);
        }
    }

    const handleronDrop = (e, index) => {
        // console.log(index)
        const dataTransfer = e.dataTransfer;

        // 检查是否有文件类型的数据项
        let hasFiles = false;
        for (let i = 0; i < dataTransfer.items.length; i++) {
            if (dataTransfer.items[i].kind === 'file') {
                hasFiles = true;
                break;
            }
        }
        if (hasFiles) {
            return;
        }
        let file_item:FileItemData
        if(user_base_info?.user_data?.file_list_pagination_mode === FileListPaginationModeEmum.pagination) {
            // 分页模式
            file_item = nowFileList.files[index]
            if(nowFileList.files[index]?.type !== FileTypeEnum.folder) {
                return; // 拖拽到的不是文件夹而是文件
            }
        } else {
            file_item = nowFileList.folders[index]
            if (nowFileList.folders.length <= index) {
                return;
            }
        }

        // 禁止把文件夹移动到自己里面：拖拽源中包含目标文件夹本身时直接拒绝
        // （同一目录下父子层级不可能同级显示，因此只需判断"目标是否为拖拽源之一"即可）
        const dragItems = getFilesByIndexs(nowFileList, selectList);
        if (dragItems.some(v => v?.name === file_item?.name)) {
            NotyFail(t("不能将文件夹移动到自己里面"))
            return;
        }

        setShowPrompt({
            open: true,
            title: `确定将文件移动并覆盖到${file_item?.name}吗?`,
            // sub_title: ``,
            handle: async () => {
                await props.draggable_handle(file_item?.name);
            }
        })
    }
    const handleDragStart = (event, index) => {
        if(!selectList.find(v=>v===index))
        setSelectList([...selectList, index]);
    };
    return (<div {...props.extraAttr} onClick={() => {
        click(props.index)
    }} className={props.mount ? "item mount-item" : "item"} role="button"
                 data-type={props.isLink?"invalid_link":props.type}
                 data-dir={!props.type || props.type === FileTypeEnum.folder}
                 data-mount={props.mount ? "true" : undefined}
                 aria-selected={getByList(selectList, props.index) !== null}
                 aria-label={props.name}
                 style={{"--filewidth": props.itemWidth ?? "33%"}}
                 onDragStart={(event) => handleDragStart(event, props.index)}
                 onDrop={(event) => handleronDrop(event, props.index)}
                 draggable = {props.draggable_handle !== undefined}
    >
        {props.icon === undefined &&
            <div >
                {(props.type === FileTypeEnum.image && props.path != undefined && !user_base_info?.user_data?.not_pre_show_image) ? (
                        <img loading="lazy" src={fileHttp.getDownloadUrl(props.path,{mtime:props.mtime,cache:1})} alt={props.name}/>) :
                    <Icon icon={''} />
                }
            </div>
        }
        {props.icon !== undefined &&
            <div className={"rotating-div"}>
                <span className="material-icons">{props.icon}</span>
            </div>
        }

        <div>
            <p className="name">
                <span>{props.name}</span>
                {props.mount_readonly && <span className="mount-readonly-tag">{t("只读")}</span>}
            </p>
            {props.size ? <p>{props.size}</p> : <p>&mdash;</p>}
            {/*<p>34MB</p>*/}
            <p>{props.show_mtime}</p>
        </div>
        {props.children}
    </div>)
}
