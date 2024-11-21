import React, {useContext, useEffect, useState} from 'react';
import {
    Route,
    HashRouter as Router,
    Routes,
    Link,
    HashRouter,
    useNavigation,
    BrowserRouter,
    useNavigate
} from "react-router-dom";
import Login from "./component/Login";
import Layout from "./component/Layout";
import {SimpleRoutes} from "../meta/component/SimpleRoutes";
import { useLocation   } from 'react-router-dom';
import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "./util/store";
import {GlobalContext} from "./GlobalProvider";




function App() {
    const location = useLocation();
    const navigate = useNavigate();
    const [befor,setBefor] = useState('');
    const [userInfo, setUserInfo] = useRecoilState($stroe.user_base_info);
    const {initUserInfo} = useContext(GlobalContext);
    useEffect(() => {
        if (localStorage.getItem("token")) {
            // 界面加载完的初始化  登录完成后才请求
            initUserInfo();
        }
    }, []);
    useEffect( () => {

        if (befor === location.pathname || befor=== "/" || befor==='/login') {
            return;
        }
        setBefor(location.pathname)
        // 监控任何路由的变化
        const token = localStorage.getItem("token");
        if (!token || token==="null") {
            navigate("/");
        }
    }, [location]);

    return (
        <SimpleRoutes rtos={["/","/login","/*"]}>
            <Login/>
            <Login/>
            <Layout/>
        </SimpleRoutes>
    );
}

export default App;
