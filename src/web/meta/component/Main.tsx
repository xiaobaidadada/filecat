import React from 'react';
import { useAtom } from 'jotai';

import {$stroe} from "../../project/util/store";
// import '../resources/css/all.css'

export function Main(props: { children?: React.ReactNode }) {
    const [nav_style, set_nav_style] = useAtom($stroe.nav_style);

    return <main className={nav_style.pc_collapsed ? "nav-collapsed" : ""}>{props.children}</main>
}
