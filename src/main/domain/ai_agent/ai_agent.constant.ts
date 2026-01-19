
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
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "edit_file",
            description: "编辑文件内容，用 new_str 替换文件中的 old_str",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "文件路径"
                    },
                    old_str: {
                        type: "string",
                        description: "需要被替换的原始字符串"
                    },
                    new_str: {
                        type: "string",
                        description: "替换后的新字符串"
                    }
                },
                required: ["path", "old_str", "new_str"]
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