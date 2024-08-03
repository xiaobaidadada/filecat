import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {RecoilRoot} from "recoil";
import {BrowserRouter} from "react-router-dom";
import "./util/in18resource"
import {GlobalProvider} from "./GlobalProvider";

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<RecoilRoot>
        <BrowserRouter >
            <GlobalProvider>
            <App/>
            </GlobalProvider>
        </BrowserRouter>
</RecoilRoot>);
