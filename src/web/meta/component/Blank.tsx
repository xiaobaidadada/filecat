import React, {ReactNode, useEffect} from 'react';
import '../resources/css/all.css'

export function Blank(props:{context?:string}) {
    return <h2 className="message">
        <i className="material-icons">sentiment_dissatisfied</i>
        <span>{props.context}</span>
    </h2>
}
