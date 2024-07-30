import React, {ReactNode} from 'react';
import {FileItemData, FileTypeEnum} from "../../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {useLocation, useNavigate} from "react-router-dom";
import {getByList} from "../../../../../common/ListUtil";
import {$stroe} from "../../../util/store";


function getModelType(name) {
    let p = name.split('.');
    if (p.length === 1) {
        return 'text';
    }
    p = p[p.length - 1];
    switch (p) {
        case 'java':
        case 'javascript':
        case 'css':
        case 'json':
        case 'python':
        case 'text':
        case 'sh':
        case 'lua':
        case 'html':
        case 'xml':
        case 'yaml':
        case 'tsx':
        case 'sql':
            return p;
        case 'txt':
        case 'ini':
        case 'env':
        case 'bash':
        case 'log':
        case 'config':
        case 'map':
        case 'out':
        case 'gitignore':
        case 'conf':
        case 'mod':
            return 'text';
        case 'js':
            return 'javascript';
        case 'md':
            return 'markdown';
        case 'py':
            return 'python';
        case 'ts':
            return 'typescript';
        case 'yml':
            return 'yaml';
        case 'cpp':
        case 'h':
        case 'c':
            return 'c_cpp'
    }
    return "text";
}

export function BaseFileItem(props: FileItemData & {extraAttr?:any, index?: number; click: (index: number, model:string,name:string) => void,itemWidth?:string }) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);

    async function click(index: number) {
        if (props.click) {
            props.click(index,getModelType(props.name),props.name);
        }
    }

    return (<div {...props.extraAttr} onClick={() => {
        click(props.index)
    }} className={"item"} role="button" data-type={props.type}
                 data-dir={!props.type || props.type === FileTypeEnum.folder}
                 aria-selected={getByList(selectList, props.index) !== null}
                 aria-label={props.name}
                 style={{
                     "--filewidth":props.itemWidth ?? "33%"
                 }}
    >
        <div>
            {/*<img/>*/}
            <i className="material-icons"></i>
        </div>
        <div>
            <p className="name">{props.name}</p>
            {props.size ? <p>{props.size}</p> : <p>&mdash;</p>}
            {/*<p>34MB</p>*/}
            <p>{props.mtime}</p>
        </div>
    </div>)
}
