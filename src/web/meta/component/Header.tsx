import React from 'react';


function Header(props:{ignore_tags?:boolean,children?:React.ReactNode[],left_children?:React.ReactNode[]}) {
    return (
        <header className={"header"}>
            {props.ignore_tags !== true &&
                <h3><a href="https://github.com/xiaobaidadada/filecat" target="_blank">FileCat</a></h3>
             }
            {
                props.left_children
            }
            <title></title>
            {
                props.children
            }
        </header>
    );
}

export default Header;
