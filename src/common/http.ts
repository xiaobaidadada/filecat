const needle = require('needle');
const querystring = require('querystring');

export class HttpRequest {

    public static async post(url: string, body: {},isForm = false,headers={}): Promise<any> {
        const rsq = await needle("post", url, body,{json:!isForm,headers:headers});
        if (rsq.statusCode === 200) {
            return rsq.body;
        } else {
            return null;

        }
    }

    public static async get(url: string,params?:{}): Promise<any> {
        try {
            const queryString = querystring.stringify(params);
            if (params) {
                url = `${url}?${queryString}`;
            }
            const rsq = await needle('get',url);
            if (rsq.statusCode === 200) {
                return rsq.body;
            }
            return null;
        } catch (e) {
            return null;
        }
    }
}
