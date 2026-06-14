import React, {ReactNode, useEffect} from 'react';
import {Icon} from "./Button";


export function Blank(props:{context?:string}) {
    return <h2 className="message">
        <Icon icon={'sentiment_dissatisfied'}/>
        <span>{props.context}</span>
    </h2>
}
