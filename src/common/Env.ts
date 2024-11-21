import fs from "fs";
import path from "path";
import os from "os";

const {execSync} = require('child_process');
const help = `
命令参数都需要加 --
1. update 升级(npm方式升级)
2. remove 移除(从npm)
3. version 版本
4. help 帮助信息
5. install 安装到systemd（只支持linux)
6. uninstall 从systemd卸载（只支持linux)
7  restart 重启systemd服务（只支持linux)
8. stop 停止运行systemd服务(支持linux)
// 以下参数都需要额外的参数输入 例如"filecat --port 8080 "端口参数 用于控制程序运行。
9. port 需要端口参数 
10. env 输入环境配置文件
11. work_dir 工作目录，软件执行需要生成一些数据，会放到这个目录下，默认是启动软件所在的目录下的data文件夹
12. base_folder 软件管理的文件夹默认根路径，默认是启动软件所在的目录
13. username 登录账号 默认是admin (截止到1.0.5目前没有权限功能)
14. password 登录密码 默认是admin
`;

export class Env {

    public static port: number = 5567;
    public static base_folder: string = process.cwd(); // 默认工作目录
    public static username: string = "";
    public static password: string = "";
    public static work_dir: string = `${process.cwd()}/data`;
    public static env: string = "";

    public static async parseArgs() {
        return new Promise((resolve, reject) => {
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
                        require("./install");
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
                    }
                }
            }
            for (const key of Object.keys(result)) {
                this[key] = result[key];
            }
            if (this.env) {
                this.load(this.env);
            }
            resolve(1);
            // return result;
        })
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

    public static parseValue(value) {
        if (this.isNumeric(value)) {
            return parseFloat(value);
        }

        if (value.toLowerCase() === 'true') {
            return true;
        }

        if (value.toLowerCase() === 'false') {
            return false;
        }

        return value;
    }

    public static load(path: string): void {
        const envData = fs.readFileSync(path, 'utf8');
        const envVariables = envData.split(/\r?\n/);
        for (const line of envVariables) {
            if (line.trim() === '' || line.trim().startsWith('#')) {
                continue;
            }
            const [key, value] = line.split('=');
            this[key.trim()] = this.parseValue(value.trim());
        }
    }
}