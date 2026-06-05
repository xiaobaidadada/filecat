import React from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../project/util/store";
// import '../resources/css/all.css'

export function Main(props: { children?: React.ReactNode }) {
    const [nav_style, set_nav_style] = useRecoilState($stroe.nav_style);

    return <main className={nav_style.pc_collapsed ? "nav-collapsed" : ""}>{props.children}</main>
}
