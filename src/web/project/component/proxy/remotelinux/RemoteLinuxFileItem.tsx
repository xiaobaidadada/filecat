import React, {ReactNode} from 'react';
import {FileItemData, FileTypeEnum} from "../../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {useLocation, useMatch, useNavigate} from "react-router-dom";
import {getByList, getMaxByList, getNewDeleteByList, joinPaths, webPathJoin} from "../../../../../common/ListUtil";
import {fileHttp, sshHttp} from "../../../util/config";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import Noty from "noty";
import {saveTxtReq} from "../../../../../common/req/file.req";
import {BaseFileItem} from "../../file/component/BaseFileItem";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {NotyFail, NotySucess} from "../../../util/noty";
import {editor_data} from "../../../util/store.util";
import { formatFileSize, MAX_SIZE_TXT } from '../../../../../common/ValueUtil';
import {getFileNameByLocation, getFilesByIndexs} from "../../file/FileUtil";
import {useTranslation} from "react-i18next";


export function RemoteLinuxFileItem(props: FileItemData & { index?: number,itemWidth?:string,fileHandler:()=>any }) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);
    const [sshInfo,setSSHInfo] = useRecoilState<any>($stroe.sshInfo);
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [enterKey,setEnterKey] = useRecoilState($stroe.enterKey);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);
    const navigate = useNavigate();
    const { t } = useTranslation();

    // const match = useMatch('/:pre/file/*');
    const clickHandler = async (index, name) => {
        const select = getByList(selectList, index);
        if (select !== null) {
            // @ts-ignore 取消选择
            setSelectList(getNewDeleteByList(selectList, index))
            // console.log('取消')
        } else {
            if (enterKey ==="ctrl") {
                // @ts-ignore 选中
                setSelectList([...selectList, index])
            } else if(enterKey ==="shift") {
                const {max,min} = getMaxByList(selectList);
                const list:number[] = [];
                if(index >= max) {
                    for(let i=max; i<=index; i++) {
                        list.push(i);
                    }
                } else {
                    for(let i=min; i >= index; i--) {
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
                const req = new SshPojo();
                req.key = sshInfo.key;
                req.dir = `/${getRouterAfter('remoteShell', getRouterPath())}${name}`
                // Object.assign(req,sshInfo);
                // req.dir = joinPaths(...shellNowDir,name);
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
                // let model = getEditModelType(name);
                // if (!model) {
                //     model = "txt"
                // }
                // if (model) {
                    // 双击文件
                    const open_file = async ()=>{
                        const req = new SshPojo();
                        req.key = sshInfo.key;
                        req.file = `/${getRouterAfter('remoteShell', getRouterPath())}${name}`
                        // Object.assign(req,sshInfo);
                        // req.file = joinPaths(...shellNowDir,name);
                        const rsq = await sshHttp.post("get/file/text",req);
                        let m = undefined;
                        if(name.endsWith(FileTypeEnum.workflow_act)){
                            m = "ace/mode/yaml"
                        } else if(name.endsWith(FileTypeEnum.draw)  || name.endsWith(FileTypeEnum.excalidraw)){
                            m = "ace/mode/json"
                        }
                        setEditorSetting({
                            model:m,
                            open: true,
                            fileName: props.name,
                            save: async (context) => {
                                req.context = context;
                                const rsq = await sshHttp.post("update/file/text",req);
                                if (rsq.code === 0) {
                                    editor_data.set_value_temp('')
                                    NotySucess("success");
                                    // setEditorSetting({open: false,  fileName: '', save: null})
                                }
                            }
                        })
                        editor_data.set_value_temp(rsq.data)
                    }
                    if (typeof props.origin_size === "number" && props.origin_size > MAX_SIZE_TXT) {
                        setShowPrompt({
                            open: true,
                            title: t("提示"),
                            sub_title: `文件超过20MB了确定要打开吗?`,
                            handle: async () => {
                                setShowPrompt({open:false,handle:null});
                                await open_file();
                            }
                        })
                        return;
                    }
                    await open_file();
                    return;
                // }
            }
        }
    }
    const draggable_handle = async ( to_file_name: string) => {
        const req = new SshPojo();
        Object.assign(req,sshInfo);
        req.target = joinPaths(...shellNowDir,to_file_name);
        const files = getFilesByIndexs(nowFileList, selectList);
        const up_files = files.map(file => joinPaths(...shellNowDir, file.name));
        for (const file of up_files) {
            req.source = file;
            if(!await sshHttp.post('move',req))return false;
        }
        setSelectList([])
        setShowPrompt({open:false,handle:null});
        await props.fileHandler()
    }
    return <BaseFileItem draggable_handle={draggable_handle} name={props.name} index={props.index} mtime={props.mtime} size={props.size} type={props.type} itemWidth={props.itemWidth} show_mtime={props.show_mtime}
    click={clickHandler}/>
}
