import axios from 'axios';
import * as querystring from 'querystring';

export class HttpRequest {

    public static async post(url: string, body: {}, isForm = false, headers = {}): Promise<any> {
        try {
            const config: any = { headers };
            if (isForm) {
                config.headers = { ...config.headers, 'Content-Type': 'application/x-www-form-urlencoded' };
                const rsq = await axios.post(url, querystring.stringify(body as any), config);
                if (rsq.status === 200) {
                    return rsq.data;
                }
            } else {
                const rsq = await axios.post(url, body, config);
                if (rsq.status === 200) {
                    return rsq.data;
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    public static async get(url: string, params?: {}, timeout?: number): Promise<any> {
        try {
            const config: any = { params };
            if (timeout) {
                config.timeout = timeout;
            }
            const rsq = await axios.get(url, config);
            if (rsq.status === 200) {
                return rsq.data;
            }
            return null;
        } catch (e) {
            return null;
        }
    }
}
