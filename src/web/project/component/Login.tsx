Global.init();
import React, {useContext, useEffect, useState} from 'react'
import {useRecoilState} from "recoil";
import {InputPassword, InputText} from "../../meta/component/Input";
import {Button} from "../../meta/component/Button";
import {useNavigate} from "react-router-dom";
import {userHttp} from "../util/config";
import {UserLogin} from "../../../common/req/user.req";
import {$stroe} from "../util/store";
import {WinCenter} from "../../meta/component/Dashboard";
import {useTranslation} from "react-i18next";
import {GlobalContext} from "../GlobalProvider";
import {NotyFail} from "../util/noty";
import {Global} from "../util/global";


function Login() {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const {initUserInfo} = useContext(GlobalContext);
    const [custom_fun_opt, set_custom_fun_opt] = useRecoilState($stroe.custom_fun_opt);

    const {t} = useTranslation();

    useEffect(() => {
        if(localStorage.getItem('token')) {
            navigate('/file')
        }
    }, []);

    async function login() {
        const data: UserLogin = {
            username: username,
            password: password
        }
        const rsq = await userHttp.post("login", data, false);
        if (rsq.code === 0) {
            localStorage.setItem('token', rsq.data)
            initUserInfo();
            set_custom_fun_opt("")
            navigate('/file')
        } else {
            NotyFail(rsq.message)
        }
    }

    return (
        <WinCenter>
            <h1>{Global.web_site_title??'FileCat'}</h1>
            <div className={"self_win_center_content"}>
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
