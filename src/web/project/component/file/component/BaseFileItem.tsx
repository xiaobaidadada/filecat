import React, {ReactNode} from 'react';
import {FileItemData, FileTypeEnum} from "../../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {getByList} from "../../../../../common/ListUtil";
import {$stroe} from "../../../util/store";
import {fileHttp} from "../../../util/config";


export function BaseFileItem(props: FileItemData & {
    extraAttr?: any,
    index?: number;
    click: (index: number, name: string) => void,
    itemWidth?: string,
    children?: React.ReactNode
}) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);

    async function click(index: number) {
        if (props.click) {
            props.click(index, props.name);
        }
    }

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
    >

        <div>
            {(props.type === FileTypeEnum.image && props.path != undefined) ? (
                <img loading="lazy" src={fileHttp.getDownloadUrl(props.path)} alt={props.name}/>) :
                <i className="material-icons"></i>}

        </div>
        <div>
            <p className="name">{props.name}</p>
            {props.size ? <p>{props.size}</p> : <p>&mdash;</p>}
            {/*<p>34MB</p>*/}
            <p>{props.mtime}</p>
        </div>
        {props.children}
    </div>)
}
