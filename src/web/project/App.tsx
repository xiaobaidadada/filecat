import React, {Suspense, useContext, useEffect, useState} from 'react';
import {
    useNavigate
} from "react-router-dom";
// import Login from "./component/Login";
// import Layout from "./component/Layout";
// import SimpleRoutes from "../meta/component/SimpleRoutes";
import { useLocation   } from 'react-router-dom';
import {useRecoilState} from "recoil";
import {$stroe} from "./util/store";
import {GlobalContext} from "./GlobalProvider";
import {getRouterPath} from "./util/WebPath";
import '../meta/resources/css/all.css'

const Layout = React.lazy(() => import("./component/Layout"));
const Login = React.lazy(() => import("./component/Login"));
const SimpleRoutes = React.lazy(() => import("../meta/component/SimpleRoutes"))


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

        if (befor === getRouterPath() || befor=== "/" || befor==='/login') {
            return;
        }
        setBefor(getRouterPath())
        // 监控任何路由的变化
        const token = localStorage.getItem("token");
        if (!token || token==="null") {
            navigate("/");
        }
    }, [location]);

    return (
        <SimpleRoutes rtos={["/","/login","/*"]}>
            <Suspense fallback={<div></div>}>
                <Login/>
            </Suspense>
            <Suspense fallback={<div></div>}>
                <Login/>
            </Suspense>
            <Suspense fallback={<div></div>}>
                <Layout/>
            </Suspense>
        </SimpleRoutes>
    );
}

export default App;
