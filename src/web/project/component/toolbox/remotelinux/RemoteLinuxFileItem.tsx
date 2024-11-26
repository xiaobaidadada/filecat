import React, {ReactNode} from 'react';
import {FileItemData, FileTypeEnum} from "../../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {useLocation, useMatch, useNavigate} from "react-router-dom";
import {getByList, getMaxByList, getNewDeleteByList, joinPaths, webPathJoin} from "../../../../../common/ListUtil";
import {fileHttp, sshHttp} from "../../../util/config";
import {getRouterAfter} from "../../../util/WebPath";
import Noty from "noty";
import {saveTxtReq} from "../../../../../common/req/file.req";
import {BaseFileItem} from "../../file/component/BaseFileItem";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {RCode} from "../../../../../common/Result.pojo";
import path from "path";
import {NotyFail} from "../../../util/noty";
import {setPreSearch} from "./RemoteLinuxFileList";
import {getEditModelType} from "../../../../../common/StringUtil";
import {editor_data} from "../../../util/store.util";


export function RemoteLinuxFileItem(props: FileItemData & { index?: number,itemWidth?:string }) {
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);
    const [sshInfo,setSSHInfo] = useRecoilState($stroe.sshInfo);
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [shellShow,setShellShow] = useRecoilState($stroe.remoteShellShow);
    const [enterKey,setEnterKey] = useRecoilState($stroe.enterKey);

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
                Object.assign(req,sshInfo);
                req.dir = joinPaths(...shellNowDir,name);
                const rsp = await sshHttp.post("get/dir",req);
                if (rsp.code !== RCode.Sucess) {
                    return;
                }
                setNowFileList(rsp.data)
                setPreSearch(rsp.data);
                setShellNowDir([...shellNowDir,name])

                if (shellShow.show) {
                    setShellShow({
                        show: true,
                        path: req.dir
                    })
                }
                setSelectList([])
                setClickList([])
                return;
            }
        } else {
            // 文件
            const item = clickList.find(v => v === index)
            if (item !== undefined) {
                let model = getEditModelType(name);
                if (!model) {
                    model = "txt"
                }
                if (model) {
                    // 双击文件
                    const req = new SshPojo();
                    Object.assign(req,sshInfo);
                    req.file = joinPaths(...shellNowDir,name);
                    const rsq = await sshHttp.post("get/file/text",req);
                    if (rsq.code === RCode.File_Max) {
                        NotyFail("超过20MB");
                        return;
                    }
                    setEditorSetting({
                        model,
                        open: true,
                        fileName: props.name,
                        save: async (context) => {
                            req.context = context;
                            const rsq = await sshHttp.post("update/file/text",req);
                            if (rsq.code === 0) {
                                editor_data.set_value_temp('')
                                setEditorSetting({open: false, model: '', fileName: '', save: null})
                            }
                        }
                    })
                    editor_data.set_value_temp(rsq.data)
                    return;
                }
            }
        }
    }

    return <BaseFileItem  name={props.name} index={props.index} mtime={props.mtime} size={props.size} type={props.type} itemWidth={props.itemWidth}
    click={clickHandler}/>
}
