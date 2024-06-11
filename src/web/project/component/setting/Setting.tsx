import React, {useEffect, useRef, useState} from 'react'
import {Dashboard, Menu, RowColumn} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {ButtonText} from "../../../meta/component/Button";
import {InputText, Select} from "../../../meta/component/Input";
import Noty from "noty";
import {settingHttp} from "../../util/config";
import {UserLogin} from "../../../../common/req/user.req";
import {RCode} from "../../../../common/Result.pojo";
import {CustomerRouter} from "./CustomerRouter";
import {CustomerApiRouter} from "./CustomerApiRouter";
import {Auth} from "./Auth";



const menuRots = [{index: 1, name: "系统", rto: "password/"},{index: 1, name: "自定义页面路由", rto: "customer_router/"},{index: 1, name: "自定义api路由", rto: "customer_api_router/"}];

export function  Settings() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const update = async () =>{
        if (!username || !password) {
            new Noty({
                type: 'error',
                text: '账号密码不能为空',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
            return;
        }
        const user = new UserLogin();
        user.username = username;
        user.password = password;
        const result = await settingHttp.post("updatePassword",user);
        if (result.code === RCode.Sucess) {
            new Noty({
                type: 'success',
                text: '修改成功',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }
    return  <Menu optionList={menuRots}>
        <Auth />
        <CustomerRouter />
        <CustomerApiRouter />
    </Menu>
}
