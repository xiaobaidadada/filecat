import React, {useEffect, useRef, useState} from 'react'
import {NavItem, SiteIndexItem,} from "./NavIndexContainer";
import {list} from "tar";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";


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

    const [userInfo, setUserInfo] = useRecoilState($stroe.user_base_info);

    return <div>
        {props.div ?
            <div className={"nav_list_a"} style={{
                background: userInfo.user_data.theme !=='dark'?props.color:null // 编辑背景
            }}>{props.name}</div> : props.clickItem || props['_type'] === 'dir' ? <div className={"nav_list_a"} style={{
                    background: userInfo.user_data.theme !=='dark'?props.color:null // 集合颜色
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
                    background: userInfo.user_data.theme !=='dark'?props.color:null // 普通链接
                }}>{props.name}</a>}
    </div>
}
