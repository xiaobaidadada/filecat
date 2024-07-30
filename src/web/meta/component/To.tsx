import React, {ReactNode} from 'react';
import {useNavigate, useLinkClickHandler, Link} from 'react-router-dom';


export function To(props: {
    className?: string,
    rto: string,
    clickFun?: Function,
    children?: ReactNode,
    key: any
}) {
    // const nav = useNavigate();
    return (
        <Link className={props.className} to={props.rto} onClick={() => {
           if(props.clickFun) props.clickFun();
        }}>
            {props.children}
        </Link>
    )
}
