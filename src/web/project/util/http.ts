import axios from "axios";
import { fetchEventSource } from '@microsoft/fetch-event-source';
import {RCode} from "../../../common/Result.pojo";
import {Result} from "../../../main/other/Result";
import {NotyFail} from "./noty";
import {config} from "./config";

let now = Date.now();
export class Http {
    baseUrl:""
    private check(data) {
        if (data && data.code===RCode.AuthFail) {
            localStorage.removeItem('token')
        }
        if (data && data.code===RCode.Fail) {
            NotyFail(data.message);
            throw data.message;
        }
        if (data && data.code===RCode.AuthFail) {
            if (Date.now() - now < 2000) {
                return ;
            }
            console.log('跳转')
            now = Date.now();
            window.location.href = "";
        }
    }

    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    async get(url = ""):Promise<Result<any>> {
        try {
            url=url===undefined?'':url;
            const rsq = await axios.get(this.baseUrl+url,{
                headers: {
                    Authorization: localStorage.getItem('token')
                }
            });
            this.check(rsq.data);
            return rsq.data
        }catch(err) {
            NotyFail(JSON.stringify(err));
            throw err;
        }
    }

    getDownloadUrl(files,params?:any) {
        let url = config.baseUrl+"download?";
        if (files ) {
            for (let file of Array.isArray(files)?files:[files]) {
                if (file.endsWith("/")  || file.endsWith("\\")) {
                    file = file.slice(0, -1);
                }
                url += `file=${file}&`;
            }
        }
        if (url.endsWith("&") || url.endsWith("/")  || url.endsWith("\\")) {
            url = url.slice(0, -1);
        }
        url = url +`&token=${encodeURIComponent(localStorage.getItem('token'))}`
        if(params) {
            for (let key of Object.keys(params)) {
                url += `&${key}=${encodeURIComponent(params[key])}`
            }
        }
        return url;
    }

    async post(url,jsonData = {},notCheck= true):Promise<Result<any>> {
        try {
            url=url===undefined?'':url;
            const rsq = await axios.post(this.baseUrl+url, jsonData,{
                headers: {
                    Authorization: localStorage.getItem('token')
                }
            });
            if (notCheck) {
                this.check(rsq.data);
            }
            return rsq.data;
        } catch (e) {
            NotyFail(JSON.stringify(e));
            throw e
        }
    }

    public getUrl(url) {
        return this.baseUrl + url;
    }

    async post_form_data(url,form_data:FormData) {
        try {
            url=url===undefined?'':url;
            const rsq = await axios.post(this.baseUrl+url, form_data,
                {
                    headers:{
                        'Content-Type': 'multipart/form-data',
                        'Authorization': localStorage.getItem('token')
                    }
                });
            this.check(rsq.data);
            return rsq.data
        } catch (e) {
            NotyFail(JSON.stringify(e));
            return null;
        }
    }

    async put(url,file,progressFun) {
        try {
            url=url===undefined?'':url;
            // 创建 FormData 对象
            const formData = new FormData();
            formData.append('file', file);
            const rsq = await axios.put(this.baseUrl+url, formData,
                {
                    headers:{
                        'Content-Type': 'multipart/form-data',
                        'Authorization': localStorage.getItem('token')
                    },
                    onUploadProgress: (progressEvent) => {
                        // 上传进度监听
                        if (progressFun) {
                            progressFun(progressEvent);
                        }

                    }
                });
            this.check(rsq.data);
            return rsq.data
        } catch (e) {
            NotyFail(JSON.stringify(e));
            throw e;
        }
    }

    async delete(url,jsonData?:any) {
       try {
           url=url===undefined?'':url;
           const rsq = await axios.delete(this.baseUrl+url,{
               headers: {
                   Authorization: localStorage.getItem('token')
               }
           });
           this.check(rsq.data);
           return rsq.data
       }catch (e) {
           NotyFail(JSON.stringify(e));
           throw e
       }
    }

    public   have_http_method(method_name) {
        return axios[method_name];
    }

    public async sse_post(
        url: string,
        jsonData: any = {},
        {
            onMessage,
            onDone,
            onError
        }: {
            onMessage?: (data: string) => void;
            onDone?: () => void;
            onError?: (err: any) => void;
        } = {}
    ) {
        const controller = new AbortController();
        // onerror	网络错误 / 500	默认：重试
        // onclose	连接断开	默认：重试
        try {
            await fetchEventSource(this.baseUrl + url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: localStorage.getItem('token') || ''
                },
                body: JSON.stringify(jsonData),
                signal: controller.signal,

                onmessage: (event) => {
                    if (event.data === '[DONE]') {
                        controller.abort();   // ⭐ 关键
                        onDone?.();
                        return;
                    }
                    onMessage?.(event.data);
                },

                onerror: (err) => {
                    controller.abort();       // ⭐ 防止无限重试
                    onError?.(err);
                    onDone?.();
                    throw err
                },
                onclose:()=>{
                    onDone?.();
                },
                openWhenHidden: true
            });
        } catch (err) {
            onError?.(err);
        }
    }

}

