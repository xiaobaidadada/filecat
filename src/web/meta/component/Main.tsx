import React from 'react';
// import '../resources/css/all.css'

export function Main(props: { children?: React.ReactNode, nav_is_collapsed?: boolean }) {
    return <main className={props.nav_is_collapsed ? "nav-collapsed" : ""}>{props.children}</main>
}
