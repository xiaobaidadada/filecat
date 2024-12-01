import React, {useEffect, useRef, useState} from 'react'
import {NavItem, SiteIndexItem,} from "./NavIndexContainer";
import {list} from "tar";


export function NavIndexItem(props: {
    name: string,
    color?: string,
    index?: number,
    url?: string,
    div?: boolean,
    target?: string,
    clickItem?: (item: any) => void,
    items: NavItem[];
    click_dir : (list)=>void;
    item:SiteIndexItem
}) {
    return <div>
        {props.div ?
            <div className={"nav_list_a"} style={{
                background: props.color
            }}>{props.name}</div> : props.clickItem || props['_type'] === 'dir' ? <div className={"nav_list_a"} style={{
                    background: props.color
                }} onClick={() => {
                    if (props['_type'] === "dir") {
                        props.click_dir(props.item);
                        return;
                    }
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
