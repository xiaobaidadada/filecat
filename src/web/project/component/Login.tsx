import React, {useEffect, useState} from 'react'
import {useRecoilState} from "recoil";
import {InputPassword, InputText} from "../../meta/component/Input";
import {Button} from "../../meta/component/Button";
import {Link, useLocation, useNavigate} from "react-router-dom";
import Noty from 'noty';
import { userHttp} from "../util/config";
import {UserLogin} from "../../../common/req/user.req";
import {$stroe} from "../util/store";
import {SelfCenter, WinCenter} from "../../meta/component/Dashboard";
import {useTranslation} from "react-i18next";


function Login() {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const { t } = useTranslation();

    async function login() {
        const data : UserLogin = {
            username:username,
            password: password
        }
        const rsq = await userHttp.post("login",data );
        if (rsq.code === 0) {
            localStorage.setItem('token',rsq.data)
            navigate('/file')
        } else {
            new Noty({
                type: 'error',
                text: '密码错误',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }

    return (
            <WinCenter>
                <h1>FileCat</h1>
                <div>
                    <InputText placeholder={t("账号")} handleInputChange={(value) => {
                        setUsername(value)
                    }}/>
                    <InputPassword placeholder={t("密码")} handleInputChange={(value) => {
                        setPassword(value)
                    }} handleEnterPress={login}/>
                    <Button text={t("登录")} clickFun={login}/>
                </div>
            </WinCenter>
    );
}

export default Login;
