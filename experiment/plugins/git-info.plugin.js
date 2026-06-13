/**
 * 示例 AI Tool 插件 - Git 仓库信息查询工具
 * 
 * 提供 Git 相关的工具函数，让 AI Agent 可以查询 Git 仓库的状态、日志等信息。
 * 
 * 安装方法：
 * 1. 在 FileCat 设置 -> 插件配置 中添加：
 *    - 名称: Git 信息查询
 *    - 路径: /path/to/git-info.plugin.js
 *    - 类型: ai_tool
 *    - 开启: 是
 * 2. 保存后，AI Agent 将会自动使用该工具
 */

const { execSync } = require('child_process');
const path = require('path');

const filecat_plugin = {
    meta: {
        id: "git-info-tool",
        name: "Git 信息查询插件",
        version: "1.0.0",
        type: "ai_tool",
        description: "提供 Git 仓库信息查询功能，可查看 Git 状态、提交日志、分支信息等",
        author: "filecat"
    },

    tools: [
        {
            schema: {
                type: "function",
                function: {
                    name: "git_status",
                    description: "获取指定目录下 Git 仓库的当前状态（相当于 git status）",
                    parameters: {
                        type: "object",
                        properties: {
                            repo_path: {
                                type: "string",
                                description: "Git 仓库的本地路径"
                            }
                        },
                        required: ["repo_path"]
                    }
                }
            },
            handler: async (args) => {
                try {
                    const repoPath = args.repo_path;
                    const status = execSync('git status', { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
                    const branch = execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf-8' }).trim();
                    return JSON.stringify({
                        repo_path: repoPath,
                        branch: branch,
                        status: status
                    }, null, 2);
                } catch (e) {
                    return JSON.stringify({ error: `获取 Git 状态失败: ${e.message}` });
                }
            }
        },
        {
            schema: {
                type: "function",
                function: {
                    name: "git_log",
                    description: "获取指定 Git 仓库的最近提交日志",
                    parameters: {
                        type: "object",
                        properties: {
                            repo_path: {
                                type: "string",
                                description: "Git 仓库的本地路径"
                            },
                            count: {
                                type: "number",
                                description: "获取最近多少条提交记录，默认 10 条"
                            }
                        },
                        required: ["repo_path"]
                    }
                }
            },
            handler: async (args) => {
                try {
                    const repoPath = args.repo_path;
                    const count = args.count || 10;
                    const log = execSync(`git log -${count} `, {
                        cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 
                    });
                    
                    const commits = log.trim().split('\n').filter(Boolean).map(line => {
                        const [hash, author, date, ...msgParts] = line.split('|');
                        return { hash, author, date, message: msgParts.join('|') };
                    });
                    
                    return JSON.stringify({ repo_path: repoPath, commits }, null, 2);
                } catch (e) {
                    return JSON.stringify({ error: `获取 Git 日志失败: ${e.message}` });
                }
            }
        }
    ],

    activate(context) {
        console.log(`[Git Plugin] 已激活`);
        // console.log('测试一下')
    },

    deactivate() {
        console.log("[Git Plugin] 已停用");
    }
};

module.exports = { filecat_plugin };
