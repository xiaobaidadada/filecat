
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
    }
];