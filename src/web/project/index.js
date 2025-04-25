import {Global} from "./util/global";

Global.init(); // 先执行
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {RecoilRoot} from "recoil";
import {BrowserRouter} from "react-router-dom";
import "./util/in18resource"
import {GlobalProvider} from "./GlobalProvider";
import {setTheme} from "./util/FunUtil";
const init = ()=>{
    try {
        const str = localStorage.getItem("user_base_info");
        if(str){
            const user_info = (JSON.parse(str));
            setTheme(user_info?.user_data?.theme);
        }
    } catch(error){
        console.error(error);
    }
}
init();

const container = document.getElementById('root');
const root = createRoot(container);

root.render(<RecoilRoot>
        <BrowserRouter basename={Global.base_url} >
            <GlobalProvider>
            <App/>
            </GlobalProvider>
        </BrowserRouter>
</RecoilRoot>);
