import axios from "axios";
import {RCode} from "../../../common/Result.pojo";
import {useNavigate} from "react-router-dom";
import Noty from "noty";
import {Result} from "../../../main/other/Result";

let now = Date.now();
export class Http {
    baseUrl:""
    private check(data) {
        if (data && data.code===RCode.AuthFail) {
            localStorage.removeItem('token')
        }
        if (data && data.code===RCode.Fail) {
            new Noty({
                type: 'error',
                text: data.message ?? '请求错误',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
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
        url=url===undefined?'':url;
        const rsq = await axios.get(this.baseUrl+url,{
            headers: {
                Authorization: localStorage.getItem('token')
            }
        });
        this.check(rsq.data);
        return rsq.data
    }

    getDownloadUrl(files) {
        let url = "/api/download?";
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
        return url +`&token=${encodeURIComponent(localStorage.getItem('token'))}`;
    }

    async post(url,jsonData = {},notCheck= true):Promise<Result<any>> {
        url=url===undefined?'':url;
        const rsq = await axios.post(this.baseUrl+url, jsonData,{
            headers: {
                Authorization: localStorage.getItem('token')
            }
        });
        if (notCheck) {
            this.check(rsq.data);
        }
        return rsq.data
    }

    async put(url,file,progressFun) {
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
    }

    async delete(url,jsonData?:any) {
        url=url===undefined?'':url;
        const rsq = await axios.delete(this.baseUrl+url,{
            headers: {
                Authorization: localStorage.getItem('token')
            }
        });
        this.check(rsq.data);
        return rsq.data
    }

}

