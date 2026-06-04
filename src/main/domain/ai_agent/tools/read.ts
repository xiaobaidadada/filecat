import {readdir, readFile} from "fs/promises";
import {ai_agent_params_type} from "./ai_agent.constant";


export const read_file_schema:ai_agent_params_type = {
    "type": "function",
    "function": {
        "name": "read_file",
        "description": "获取本地文本类型的文件的内容",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件的绝对路径"
                }
            },
            "required": ["path"]
        }
    }
}

export const list_files_schema:ai_agent_params_type =   {
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
}

export const list_files_tool = async ({path = '.'}) => {
    const files = await readdir(path, {withFileTypes: true});
    return `${path}下的文件列表为: ${files.map(f => `${f.isDirectory() ? 'DIR ' : 'FILE'} ${f.name}`).join('\n')}`;
}

export const read_file_tool = async ({path}) => {
    const content = await readFile(path, 'utf-8');
    return JSON.stringify({
        file_path: path,
        file_content: content,
    });
}