import {CommonUtil} from "../../../../../common/common.util";
import {register_session_cleaner} from "./session_cleanup";
import {ai_agent_params_type} from "../ai_agent.tools";
import type { Ai_agent_tool_ctx } from "../ai_agent.tools";


export const sleep_tool = async (
    ctx: Ai_agent_tool_ctx,
    { sleep_length }: { sleep_length: number },
) => {
    const { session_id } = ctx;
    return CommonUtil.sleep_by_id(session_id, {sleep_length})
}

// 会话结束时释放这个会话里还在 sleep 的定时器
register_session_cleaner("sleep", (session_id) => CommonUtil.sleep_delete_by_id(session_id));

export const sleep_schema:ai_agent_params_type = {
    type: "function",
    function: {
        name: "sleep",
        description: "当前 agent 聊天的时候进程执行进行堵塞一段时间，可以用于需要后台进程先执行一会，然后再看看执行情况的场景",
        parameters: {
            type: "object",
            properties: {
                 sleep_length: {
                    type: "number",
                    description: "要堵塞的时间长度，单位是毫秒"
                }
            },
            required: ["sleep_length"]
        }
    }
}
