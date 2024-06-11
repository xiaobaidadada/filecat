import React, {useEffect, useRef, useState} from 'react'


export function NavIndexItem(props: {
    name: string,
    color?: string,
    index?: number,
    url?: string,
    div?: boolean,
    target?: string,
    clickItem?: (item: any) => void
}) {
    return <div>
        {props.div ?
            <div className={"nav_list_a"} style={{
                background: props.color
            }}>{props.name}</div> : props.clickItem ? <div className={"nav_list_a"} style={{
                    background: props.color
                }} onClick={() => {
                    if (props.clickItem) {
                        props.clickItem(props)
                    }
                }}>
                    {props.name}
                </div> :
                <a href={props.url} target={props.target} className={"nav_list_a"} style={{
                    background: props.color
                }}>{props.name}</a>}
    </div>
}
