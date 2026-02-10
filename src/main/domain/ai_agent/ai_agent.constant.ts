
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
                    description: "用于搜索知识库的关键词列表"
                }
            },
            required: ["keywords"]
        }
    }
}
// 为ai提供有限的系统信息
export const ai_tools = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "获取本地文件的内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件的路径"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_files",
            description: "列出指定目录下的文件和文件夹",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "要列出的目录路径，默认为当前目录"
                    }
                },
                required: ['path']
            }
        }
    },
    {
        type: "function",
        function: {
            name: "edit_file",
            description: "编辑文件内容，用 new_content 替换文件中的内容",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "文件路径"
                    },
                    new_content: {
                        type: "string",
                        description: "新的文件内容"
                    }
                },
                required: ["path", "new_content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "exec_cmd",
            description: "在服务器上执行系统命令，从而获取系统的信息，或者执行一些系统功能，要区分不同系统支持的命令情况",
            parameters: {
                type: "object",
                properties: {
                    cmd: {
                        type: "string",
                        description: "要执行的系统命令"
                    }
                },
                required: ["cmd"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "http_request",
            description:
                "发送 HTTP 请求以访问外部网络资源。支持 GET/POST/PUT/DELETE/PATCH 等方法，可设置请求头、查询参数和请求体。",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "请求的完整 URL（仅支持 http 或 https）"
                    },
                    method: {
                        type: "string",
                        description: "HTTP 方法，如 GET、POST、PUT、DELETE、PATCH，默认 GET"
                    },
                    headers: {
                        type: "object",
                        additionalProperties: { type: "string" },
                        description: "请求头（键值对）"
                    },
                    query: {
                        type: "object",
                        additionalProperties: {
                            oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }]
                        },
                        description: "URL 查询参数"
                    },
                    body: {
                        description: "请求体内容（对象将自动转为 JSON）"
                    },
                    timeout: {
                        type: "number",
                        description: "请求超时时间（毫秒），默认 10000"
                    },
                    max_length: {
                        type: "number",
                        description: "最大返回字符数，超出将被截断，默认 8000"
                    }
                },
                required: ["url"]
            }
        }
    }

];