import {FileTree, FileTreeList} from "../../../../../../../common/file.pojo";
import {Folder} from "./Folder";
import React, {useEffect, useState} from "react";



export function FolderTree(props:{list:FileTreeList,pre_path:string,click?:(pojo:FileTree,set_children:(list:FileTree[])=>void,pre_path:string)=>Promise<void>}) {

    return <div >
        {props.list.map((value,index)=>{
            return <Folder pre_path={`${props.pre_path}${value.name}/`} key={index} name={value.name} type={value.type} children={value.children} click={props.click}/>
        })}
    </div>
}