import React, {ReactNode} from 'react';
import {Route, Routes} from "react-router-dom";


export interface RouteContainerProps {
    // 必须数个子节点属性
    // 多个选项卡
    rtos: string[];
    children: ReactNode[];
}
export const SimpleRoutes: React.FC<RouteContainerProps> = (props) => {
    return ( <Routes>
        {props.children.map((value, index) => {
            return (
                // @ts-ignore
                <Route key={index} path={props.rtos[index]} element={(value)}/>
            )
        })}
        ( <Route  path={"/"} element={(props.children[0])}/>)
    </Routes>)
}
