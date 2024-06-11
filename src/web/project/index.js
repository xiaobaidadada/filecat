import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {RecoilRoot} from "recoil";
import {BrowserRouter} from "react-router-dom";

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<RecoilRoot>
    <BrowserRouter >
        <App/>
    </BrowserRouter>

</RecoilRoot>);
