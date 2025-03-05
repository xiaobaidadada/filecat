import {ws} from "../../../util/ws";
import {CmdType} from "../../../../../common/frame/WsData";
import {workflow_pre_input, WorkflowReq, WorkRunType} from "../../../../../common/req/file.req";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";

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