import React, {ReactNode} from 'react';
import {FileItemData, FileTypeEnum} from "../../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {getByList} from "../../../../../common/ListUtil";
import {$stroe} from "../../../util/store";
import {fileHttp, userHttp} from "../../../util/config";
import {UserData} from "../../../../../common/req/user.req";
import {RCode} from "../../../../../common/Result.pojo";
import {NotySucess} from "../../../util/noty";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {useNavigate} from "react-router-dom";
import {getFileNameByLocation, getFilesByIndexs} from "../FileUtil";


export function BaseFileItem(props: FileItemData & {
    extraAttr?: any,
    index?: number;
    click: (index: number, name: string) => void,
    itemWidth?: string,
    children?: React.ReactNode,
    draggable_handle?: (to:string) => any
}) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);

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
        if (nowFileList.folders.length <= index) {
            return; // 拖拽到的不是文件夹而是文件
        }
        setShowPrompt({
            open: true,
            title: `确定将文件移动并覆盖到${nowFileList.folders[index].name}吗?`,
            // sub_title: ``,
            handle: async () => {
                await props.draggable_handle(nowFileList.folders[index].name);
            }
        })
    }
    const handleDragStart = (event, index) => {
        if(!selectList.find(v=>v===index))
        setSelectList([...selectList, index]);
    };
    return (<div {...props.extraAttr} onClick={() => {
        click(props.index)
    }} className={"item"} role="button"
                 data-type={props.isLink?"invalid_link":props.type}
                 data-dir={!props.type || props.type === FileTypeEnum.folder}
                 aria-selected={getByList(selectList, props.index) !== null}
                 aria-label={props.name}
                 style={{
                     "--filewidth": props.itemWidth ?? "33%"
                 }}
                 onDragStart={(event) => handleDragStart(event, props.index)}
                 onDrop={(event) => handleronDrop(event, props.index)}
                 draggable = {props.draggable_handle !== undefined}
    >
        {props.icon === undefined &&
            <div >
                {(props.type === FileTypeEnum.image && props.path != undefined && !user_base_info?.user_data?.not_pre_show_image) ? (
                        <img loading="lazy" src={fileHttp.getDownloadUrl(props.path,{mtime:props.mtime,cache:1})} alt={props.name}/>) :
                    <i className="material-icons"></i>
                }
            </div>
        }
        {props.icon !== undefined &&
            <div className={"rotating-div"}>
                <span className="material-icons">{props.icon}</span>
            </div>
        }

        <div>
            <p className="name">{props.name}</p>
            {props.size ? <p>{props.size}</p> : <p>&mdash;</p>}
            {/*<p>34MB</p>*/}
            <p>{props.show_mtime}</p>
        </div>
        {props.children}
    </div>)
}
