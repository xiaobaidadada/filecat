import { readFile, writeFile, readdir } from 'fs/promises';
import {shellServiceImpl} from "../shell/shell.service";
import {exec_cmd_type, exec_type, PtyShell} from "pty-shell";
import {SystemUtil} from "../sys/sys.utl";

export const Ai_agentTools = {
    // 读取文件
    read_file:async ({path})=> {
            const content = await readFile(path, 'utf-8');
            return content;
    },
    // 读取目录
    list_files: async ({ path = '.' })=> {
        const files = await readdir(path, { withFileTypes: true });
        return files.map(f => `${f.isDirectory() ? 'DIR ' : 'FILE'} ${f.name}`).join('\n');
    },
    // 修改文件
    edit_file: async ({ path, new_content })=> {
        await writeFile(path, new_content, 'utf-8');
        return 'OK';
    },
    // 执行命令
    exec_cmd: async ({cmd}:{cmd: string})=> {
        return SystemUtil.execAsync(cmd)
    },

}

export type Ai_agentTools_type = keyof typeof Ai_agentTools;
