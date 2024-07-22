import axios from "axios";
import {RCode} from "../../../common/Result.pojo";
import {useNavigate} from "react-router-dom";
import Noty from "noty";

export class Http {

    check(data) {
        if (data && data.code===RCode.AuthFail) {
            localStorage.removeItem('token')
        }
        if (data && data.code===RCode.Fail) {
            new Noty({
                type: 'error',
                text: '请求错误',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }

    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    async get(url) {
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
        let url = "/download?";
        if (files ) {
            for (let file of files) {
                url += `file=${file}&`;
            }
        }
        return url.slice(0, -1);
    }

    async post(url,jsonData) {
        url=url===undefined?'':url;
        const rsq = await axios.post(this.baseUrl+url, jsonData,{
            headers: {
                Authorization: localStorage.getItem('token')
            }
        });
        this.check(rsq.data);
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

    async delete(url,jsonData) {
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

