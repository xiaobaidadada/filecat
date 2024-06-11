import fs from "fs";
import path from "path";

export class Env {

    public static  port: number = 5567;
    public static base_folder:string = ".";
    public static username:string = "";
    public static password:string = "";
    public static work_dir:string = "./data";
    public static env:string = "";
    public static parseArgs() {
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
            }
        }
        for (const key of Object.keys(result)) {
            this[key] = result[key];
        }
        if (this.env) {
            this.load(this.env);
        }
        return result;
    }
    public static updateEnv(list:{key:string, value?:string}[]) {
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
    public static load(path:string):void {
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