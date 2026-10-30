import {ai_agentService} from "../../ai_agent.service";
import type { Ai_agent_tool_ctx } from "../ai_agent.tools";


export const ai_tools_search_docs = {
    type: "function",
    function: {
        name: "search_docs",
        description: "在本地知识库中搜索相关文档，根据关键词返回最匹配的文件内容",
        parameters: {
            type: "object",
            properties: {
                keywords: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "用于搜索知识库的关键词列表，keywords每个元素都是一个词而不是一句话"
                }
            },
            required: ["keywords"]
        }
    }
}

export const search_docs_tool = async (
    ctx: Ai_agent_tool_ctx,
    { keywords }: { keywords: string[] },
) => {
    return ai_agentService.search_docs({keywords})
}
