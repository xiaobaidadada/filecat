import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {RecoilRoot} from "recoil";
import {BrowserRouter} from "react-router-dom";
import "./util/in18resource"
import {GlobalProvider} from "./GlobalProvider";


const container = document.getElementById('root');
const root = createRoot(container);
if(process.env.NODE_ENV === "production") {
    console.log = ()=>{};
}
root.render(<RecoilRoot>
        <BrowserRouter basename={window.FileCat.base_url||process.env.base_url} >
            <GlobalProvider>
            <App/>
            </GlobalProvider>
        </BrowserRouter>
</RecoilRoot>);
