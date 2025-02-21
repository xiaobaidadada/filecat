import React, {ReactNode} from 'react';
// import '../resources/css/all.css'
import {MaterialIcon} from "material-icons";
import {To} from "./To";

export interface NavItem {
    icon: MaterialIcon,
    name: string,
    rto: string,
    clickFun?: Function,
    component?:ReactNode
}

export interface NavProps {
    navList: NavItem[][],
    nav_is_mobile: boolean,
}

export function Nav(props: NavProps) {
    return (
        <nav className={`${props.nav_is_mobile && "active"}  not-select-div`}>
            {props.navList.map((item, index) => {
                return (<div key={index} className=" nav_1">
                    {item.map((item2, index) => {
                        if (item2.component) return (
                            <div  key={index}>
                                {item2.component}
                            </div>
                        );
                        return (
                            <To rto={item2.rto} key={index} clickFun={item2.clickFun} className=" nav_2 ">
                                <i className="material-icons action">{item2.icon}</i>
                                <span className=" nav_3">{item2.name}</span>
                            </To>)
                    })}
                </div>)

            })}
        </nav>
    );
}
