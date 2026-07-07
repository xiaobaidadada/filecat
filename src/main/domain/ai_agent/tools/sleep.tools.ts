import {ai_agent_params_type} from "./ai_agent.constant";
import {CommonUtil} from "../../../../common/common.util";


export const sleep_tool = async ({sleep_length}: { sleep_length: number }) => {
    await CommonUtil.sleep(sleep_length);
    return `已经成功睡眠堵塞 ${sleep_length}毫秒。`
}

export const sleep_schema:ai_agent_params_type = {
    type: "function",
    function: {
        name: "sleep",
        description: "当前 agent 聊天的时候进程执行进行堵塞一段时间，可以用于需要后台进程先执行一会，然后再看看执行情况的场景",
        parameters: {
            type: "object",
            properties: {
                 sleep_length: {
                    type: "string",
                    description: "要堵塞的时间长度，单位是毫秒"
                }
            },
            required: ["sleep_length"]
        }
    }
}