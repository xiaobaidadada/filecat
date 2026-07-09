import {ai_agent_params_type} from "./ai_agent.constant";


export const pick_model_tool = async ({max_call_num,model}: { max_call_num: number,model:string }) => {
    return `已经成功设置接下来要调用的模型为 ${model} 调用最大次数为 ${max_call_num}`
}

export const pick_model_schema:ai_agent_params_type = {
    type: "function",
    function: {
        name: "pick_model",
        description: "当你调用了这个函数，下一次将由别的模型来回答用户，下一轮或者多轮对话中，会切换成别的模型",
        parameters: {
            type: "object",
            properties: {
                max_call_num: {
                    type: "number",
                    description: "别的模型接下来回答用户的最大回答次数，默认为 1 调用一次"
                },
                model: {
                    type: "string",
                    description: "别的模型名称"
                }
            },
            required: ["model"]
        }
    }
}