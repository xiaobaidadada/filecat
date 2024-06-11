import React from 'react';
import '../resources/css/all.css'

function Header(props) {
    return (
        <header className={"header"}>
            {props.children}
        </header>
    );
}

export default Header;
