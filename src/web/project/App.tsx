import React, {useEffect, useState} from 'react';
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
import {ActionButton} from "../meta/component/Button";
import Header from "../meta/component/Header";
import {SimpleRoutes} from "../meta/component/SimpleRoutes";
import { useLocation   } from 'react-router-dom';
import {useRecoilState} from "recoil";
import {$stroe} from "./util/store";



function App() {
    const location = useLocation();
    const navigate = useNavigate();
    const [befor,setBefor] = useState('');
    useEffect(() => {
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
        <div style={{
            "height":"100%"
        }}>
                <SimpleRoutes rtos={["/","/login","/*"]}>
                    <Login/>
                    <Login/>
                    <Layout/>
                </SimpleRoutes>
        </div>

    );
}

export default App;
