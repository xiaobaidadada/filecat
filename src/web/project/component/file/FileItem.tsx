import React, {ReactNode, useState} from 'react';
import {FileItemData, FileTypeEnum} from "../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {useLocation, useMatch, useNavigate} from "react-router-dom";
import {getByList, getNewDeleteByList, webPathJoin} from "../../../../common/ListUtil";
import {fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import Noty from "noty";
import {saveTxtReq} from "../../../../common/req/file.req";
import {BaseFileItem} from "./component/BaseFileItem";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail} from "../../util/noty";
import {PromptEnum} from "../prompts/Prompt";
import {StringUtil} from "../../../../common/StringUtil";
import {FileMenuData, FileMenuEnum, getFileFormat} from "../prompts/FileMenu/FileMenuType";


export function FileItem(props: FileItemData & { index?: number,itemWidth?:string }) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [editorValue, setEditorValue] = useRecoilState($stroe.editorValue)

    const navigate = useNavigate();
    let location = useLocation();
    // const match = useMatch('/:pre/file/*');
    const clickHandler = async (index, model, name) => {
        const select = getByList(selectList, index);
        if (select !== null) {
            // @ts-ignore 取消选择
            setSelectList(getNewDeleteByList(selectList, index))
            // console.log('取消')
        } else {
            // @ts-ignore 选中
            setSelectList([...selectList, index])
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
                if (model) {
                    // 双击文件
                    const rsq = await fileHttp.get(`${getRouterAfter('file', location.pathname)}${name}`)
                    if (rsq.code === RCode.File_Max) {
                        NotyFail("超过20MB");
                        return;
                    }
                    setEditorSetting({
                        model,
                        open: true,
                        fileName: props.name,
                        save: async (context) => {
                            const data: saveTxtReq = {
                                context
                            }
                            const rsq = await fileHttp.post(`save/${getRouterAfter('file', location.pathname)}${props.name}`, data)
                            if (rsq.code === 0) {
                                setEditorValue('')
                                setEditorSetting({open: false, model: '', fileName: '', save: null})
                            }
                        }
                    })
                    setEditorValue(rsq.data)
                    return;
                }
                new Noty({
                    type: 'warning',
                    text: '暂时只支持文本文件',
                    timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                    layout: "bottomLeft"
                }).show();
            }
        }
    }

    // 右键功能
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);


    const handleContextMenu = (event,name) => {
        event.preventDefault();
        const pojo = new FileMenuData();
        pojo.filename = name;
        pojo.x = event.clientX;
        pojo.y = event.clientY;
        pojo.type = getFileFormat(name);
        setShowPrompt({show: true,type:PromptEnum.FileMenu,overlay: false,data:pojo});
    };


    return <BaseFileItem extraAttr={{onContextMenu:(event)=>{handleContextMenu(event,props.name)}}} name={props.name} index={props.index} mtime={props.mtime} size={props.size} type={props.type}
                         click={clickHandler} itemWidth={props.itemWidth}>
    </BaseFileItem>
}
