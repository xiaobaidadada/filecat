
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
    }
];