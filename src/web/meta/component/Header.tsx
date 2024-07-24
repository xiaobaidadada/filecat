import React from 'react';
import '../resources/css/all.css'

function Header(props:{ignore_tags?:boolean,children?:React.ReactNode[]}) {
    return (
        <header className={"header"}>
            {props.ignore_tags !== true &&
                <title><h3><a href="https://github.com/xiaobaidadada/filecat" target="_blank">FileCat</a></h3></title>}

            {
                props.children
            }
        </header>
    );
}

export default Header;
