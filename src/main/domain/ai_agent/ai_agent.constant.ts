
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
            description: `
编辑文件工具，支持五种模式：
overwrite / replace / append / insert / delete
    `,
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string"
                    },

                    action: {
                        type: "string",
                        enum: ["overwrite", "replace", "append", "insert", "delete"]
                    },

                    content: {
                        oneOf: [
                            {
                                description: "overwrite / append",
                                type: "string"
                            },

                            {
                                description: "replace operations",
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        find: { type: "string" },
                                        replace: { type: "string" }
                                    },
                                    required: ["find"]
                                }
                            },

                            {
                                description: "insert",
                                type: "object",
                                properties: {
                                    line: { type: "number" },
                                    content: {
                                        oneOf: [
                                            { type: "string" },
                                            {
                                                type: "array",
                                                items: { type: "string" }
                                            }
                                        ]
                                    }
                                },
                                required: ["line", "content"]
                            },

                            {
                                description: "delete",
                                type: "object",
                                properties: {
                                    start: { type: "number" },
                                    end: { type: "number" }
                                },
                                required: ["start", "end"]
                            }
                        ]
                    }
                },
                required: ["path", "action"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "exec_cmd",
            description: "在服务器上执行系统命令，从而获取系统的信息，或者执行一些系统功能，要区分不同系统支持的命令情况，使用child_process的exec来执行不使用shell",
            parameters: {
                type: "object",
                properties: {
                    cmd: {
                        type: "string",
                        description: "要执行的系统命令"
                    },
                    cwd: {
                        type: "string",
                        description: "命令执行的工作目录，默认是当前目录"
                    },
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
                        description: "最大返回字符数，超出将被截断，默认 8000,-1s是不截断"
                    }
                },
                required: ["url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_in_files",
            description: "在本地项目中跨文件搜索文本内容（类似 grep），返回匹配的文件、行号和内容",
            parameters: {
                type: "object",
                properties: {
                    pattern: {
                        type: "string",
                        description: "要搜索的正则或关键词"
                    },
                    path: {
                        type: "string",
                        description: "搜索路径"
                    },
                    max_files: {
                        type: "number",
                        description: "最多扫描多少个文件，默认50"
                    },
                    max_matches_per_file: {
                        type: "number",
                        description: "每个文件最多匹配多少条结果，默认20"
                    },
                    ignore_case: {
                        type: "boolean",
                        description: "是否忽略大小写，默认true"
                    }
                },
                required: ["pattern"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_fs_entry",
            description: "创建文件或目录，支持初始化文件内容和递归创建目录",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "文件或目录路径"
                    },
                    type: {
                        type: "string",
                        enum: ["file", "dir"],
                        description: "创建类型：file=文件，dir=目录"
                    },
                    content: {
                        type: "string",
                        description: "文件初始内容，仅在 type=file 时生效"
                    },
                    recursive: {
                        type: "boolean",
                        description: "是否递归创建目录，仅在 type=dir 时生效，默认 true"
                    }
                },
                required: ["path", "type"]
            }
        }
    }
];