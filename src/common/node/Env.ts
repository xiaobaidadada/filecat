import fs from "fs";
import path from "path";
import os from "os";
import {UserLanguage} from "../req/user.req";

const {execSync} = require('child_process');
const help = `
All command-line options must be prefixed with --.

1. update — Update FileCat (via npm)
2. remove — Remove FileCat (from npm)
3. version — Display the current version
4. help — Display help information
5. install — Install FileCat as a systemd service (Linux only)
6. uninstall — Uninstall FileCat from systemd (Linux only)
7. restart — Restart the systemd service (Linux only)
8. stop — Stop the systemd service (Linux only)

The following options require an additional argument. For example:
filecat --port 8080

9. port — Port used by FileCat
10. env — Environment configuration file
11. work_dir — Working directory. FileCat stores generated data in this directory. Defaults to the data folder in the directory where FileCat is started.
12. base_folder — Root directory managed by FileCat. Defaults to the directory where FileCat is started.
13. username — Login username. Defaults to admin. Permission management is not supported as of version 1.0.5.
14. password — Login password. Defaults to admin.
15. reset_root_username — Generate a new administrator username. Remove this option after starting FileCat; otherwise it will be executed again on the next startup.
16. reset_root_password — Generate a new administrator password. Remove this option after starting FileCat; otherwise it will be executed again on the next startup.
17. base_url — URL path prefix.
18. lan — Language. Only takes effect when the account is created for the first time. Currently supported languages: zh (Simplified Chinese) and en (English).
19. watch — Internal option.

For the shell, FileCat supports the filecat-restart command to restart FileCat.

`;

export class Env {

    public static port: number = 5567;
    public static base_folder: string = process.cwd(); // 默认工作目录
    public static username: string = "";
    public static password: string = "";
    public static work_dir: string = path.join(process.cwd(),'data');
    public static env: string = "";
    public static reset_root_username: string;
    public static reset_root_password: string;
    public static base_url: string; // 本地 dev的时候这个参数没有用  env.j会生效
    public static lan: UserLanguage = "sys";

    // public static https_tunnel_server_port: number;
    // public static https_tunnel_server_open:boolean
    // public static https_tunnel_key: string;
    // public static https_tunnel_key_kb_size:number;
    // public static https_tunnel_forbid_regexp:string;

    // public static watch: boolean = false;
    public static installMode: boolean = false;

    public static  parseArgs() {
            const args = process.argv.slice(2);
            const result = {};

            for (let i = 0; i < args.length; i++) {
                const arg = args[i];

                if (arg.startsWith('--')) {
                    const key = arg.slice(2);
                    let value = true;

                    if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                        // @ts-ignore
                        value = args[++i];
                    }

                    // @ts-ignore
                    if (value === 'true') {
                        value = true;
                    } else { // @ts-ignore
                        if (value === 'false') {
                            value = false;
                        } else { // @ts-ignore
                            if (!isNaN(value)) {
                                // @ts-ignore
                                value = Number(value);
                            }
                        }
                    }

                    result[key] = value;
                    // 特殊安装处理
                    if (key === "install") {
                        if (os.platform() !== "linux") {
                            console.log("sorry现在只支持linux")
                            process.exit();
                        }
                        Env.installMode = true;
                        require("./install");
                        // install.js 是交互式异步的，这里不 return，
                        // 但设置 installMode 让 start_main 跳过启动
                        return;
                    } else if (key === "version") {
                        console.log(process.env.version)
                        process.exit();
                    } else if (key === "update") {
                        execSync("npm install -g filecat");
                        process.exit();
                    } else if (key === "help") {
                        console.log(help);
                        process.exit();
                    } else if (key === "stop") {
                        if (os.platform() !== "linux") {
                            console.log("sorry现在只支持linux")
                            process.exit();
                        }
                        execSync("sudo systemctl stop filecat");
                        process.exit();
                    } else if (key === "restart") {
                        if (os.platform() !== "linux") {
                            console.log("sorry现在只支持linux")
                            process.exit();
                        }
                        execSync(`sudo systemctl daemon-reload`)
                        execSync(`sudo systemctl restart filecat`)
                        process.exit();
                    } else if (key === "uninstall") {
                        if (os.platform() !== "linux") {
                            console.log("sorry现在只支持linux")
                            process.exit();
                        }
                        execSync("sudo systemctl stop filecat");
                        execSync("sudo systemctl disable  filecat");
                        execSync(`sudo rm /etc/systemd/system/filecat.service`)
                        execSync(`sudo systemctl daemon-reload`);
                        console.log("卸载完成")
                        process.exit();
                    } else if (key === "env") {
                        if (this.env) {
                            const envData = fs.readFileSync(this.env, 'utf8');
                            this.load(envData,result);
                        }
                    }
                }
            }
            for (const key of Object.keys(result)) {
                this[key] = result[key];
            }
    }

    public static updateEnv(list: { key: string, value?: string }[]) {
        if (!this.env) return;
        const envData = fs.readFileSync(path.join(this.env), 'utf8');
        const envVariables = envData.split(/\r?\n/);
        for (let index = 0; index < envVariables.length; index++) {
            const line = envVariables[index];
            for (const item of list) {
                if (line.includes(item.key)) {
                    envVariables[index] = `${item.key}=${item.value || ""}`;
                    this[item.key] = item.value;
                }
            }
        }
        fs.writeFileSync(path.join(this.env), envVariables.join('\n'));
    }

    public static isNumeric(value) {
        return /^-?\d+(\.\d+)?$/.test(value);
    }

    public static parseValue(value: string): any {
        const trimmed = value.trim();

        // 去掉包裹引号
        if (
            (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))
        ) {
            const unquoted = trimmed.slice(1, -1);

            // 处理常见转义
            return unquoted
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t');
        }

        // 数字
        if (!isNaN(Number(trimmed))) {
            return Number(trimmed);
        }

        // 布尔
        if (trimmed.toLowerCase() === 'true') {
            return true;
        }

        if (trimmed.toLowerCase() === 'false') {
            return false;
        }

        return trimmed;
    }

    public static load(envData: string, target: any): void {
        if (!envData) return;

        const envVariables = envData.split(/\r?\n/);

        for (const rawLine of envVariables) {
            const line = rawLine.trim();

            if (!line || line.startsWith('#') || line.startsWith(';')) continue;

            const equalIndex = line.indexOf('=');
            if (equalIndex === -1) continue;

            const key = line.slice(0, equalIndex).trim();
            const value = line.slice(equalIndex + 1).trim();
            if(!value) {
                target[key] = undefined;
            } else {
                try {
                    target[key] = JSON.parse(value);
                } catch (e) {
                    target[key] = this.parseValue(value);
                }
            }
        }
    }

}
