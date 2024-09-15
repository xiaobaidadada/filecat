import {FileTree, FileTreeList, FileTypeEnum} from "../../../../../../../common/file.pojo";
import {Folder} from "./Folder";
import React, {useEffect, useState} from "react";
import {InputTextIcon} from "../../../../../../meta/component/Input";


export function FolderTree(props: {
    list: FileTreeList,
    pre_path: string,
    click?: (pojo: FileTree, set_children: (list: FileTree[]) => void, pre_path: string) => Promise<void>,
    handleContextMenu?: (event, name,path, isDir,toggleExpansion) => void,
    fatherNowToggleExpansion?:()=>void
}) {

    return <div>
        {/*<InputTextIcon handleEnterPress={() => {*/}
        {/*    set_search(folder_context ?? "");*/}
        {/*}} placeholder={"搜索文件"} icon={"search"} value={""} handleInputChange={(v) => { folder_context = v;}} max_width={"25em"}/>*/}
        {props.list.map((value, index) => {
            return <Folder pre_path={`${props.pre_path}${value.name}${value.type===FileTypeEnum.folder ? "/":""}`} key={index} name={value.name} type={value.type}
                           handleContextMenu={props.handleContextMenu}
                           fatherNowToggleExpansion={props.fatherNowToggleExpansion}
                           children={value.children} click={props.click}/>
        })}
    </div>
}