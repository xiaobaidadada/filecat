import React, {ReactNode,Suspense} from 'react';
import {Route, Routes} from "react-router-dom";
import Layout from "../../project/component/Layout";


export interface RouteContainerProps {
    // 必须数个子节点属性
    // 多个选项卡
    rtos: string[];
    children: ReactNode[];
}
const SimpleRoutes: React.FC<RouteContainerProps> = (props:RouteContainerProps) => {
    const routes = props.rtos.map((rto, index) => {
        const child = props.children[index];
        return <React.Fragment key={index} >
            <Route path={rto} element={<Suspense fallback={<div></div>}>{child}</Suspense>} />
        </React.Fragment>;
    });
    // 如果没有根路由，添加一个默认指向第一个子路由
    if (!props.rtos.some(r => r === "/" || r === "")) {
        routes.push(
            <React.Fragment key="root" >
                <Route path="/" element={<Suspense fallback={<div></div>}>{props.children[0]}</Suspense>} />
            </React.Fragment>
        );
    }
    return (<Routes>{routes}</Routes>)
}

export default SimpleRoutes;