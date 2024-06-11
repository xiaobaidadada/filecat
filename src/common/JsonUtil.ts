const serialize = require("serialize-javascript");

export class JsonUtil {
    public static getJson(data: any): string {
        return serialize(data) as string;
    }

    public static fromJson<T>(str: string): T {
        // eslint-disable-next-line no-eval,@typescript-eslint/no-unsafe-return
        return eval(`(${str})`);
    }
}
