import {ws} from "../../../util/ws";
import {CmdType} from "../../../../../common/frame/WsData";
import {workflow_pre_input, WorkflowReq, WorkRunType} from "../../../../../common/req/file.req";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {useTranslation} from "react-i18next";

export const run_workflow= async (filename,code:3|4,inputs:workflow_pre_input[] = []) =>{

    const pojo = new WorkflowReq();
    pojo.path = `${getRouterAfter('file', getRouterPath())}${filename}`;
    pojo.inputs = inputs;
    if(code===3) {
        pojo.run_type = WorkRunType.start;
    } else if(code===4) {
        pojo.run_type = WorkRunType.stop;
    }
    await ws.sendData(CmdType.workflow_exec, pojo)
}


export enum common_menu_type {
    stop_workflow = 4,
    real_time_workflow = 5,
    run_workflow = 3,
    run_real_time_workflow = "3_1",
    open_text = 1,
    run_workflow_by_pre_inputs = 6,
    logviwer_text = "utf8",
    logviwer_utf8 = "utf8",
    logviwer_utf16 = "utf16",
    logviwer_utf32 = "utf32",
    logviwer_gbk = "gbk",
    logviwer_gb2312 = "gb2312",
    logviwer_gb18030 = "gb18030",
    // logviwer_usc2 = "usc2",
    logviwer_windows1252 = "windows1252",
    // logviwer_big5 = "big5",
    // logviwer_ios_8859_1 = "ios-8859-1",

    sutdio = "sutdio",
    folder_size_info = "folder_size_info",
    file_quick_cmd = "file_quick_cmd",
    file_copy_name = "file_copy_name", // 复制名字
    file_copy_ab_path = "file_copy_ab_path", // 复制绝对路径
    file_copy_now_path = "file_copy_now_path", // 复制相对项目的路径

    un_compress = "un_compress",
    share_file = "share_file",
    share_file_download = "share_file_download",
    ai_load_one_file = "ai_load_one_file",
    ai_del_one_file = "ai_del_one_file",
}