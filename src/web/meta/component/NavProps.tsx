import React, {ReactNode, useCallback, useEffect, useMemo} from 'react';
import {MaterialIcon} from "material-icons";
import {To} from "./To";
import {get_filter_key, get_router_key_set} from "../../project/util/WebPath";
import { useAtom } from 'jotai';
import {$stroe} from "../../project/util/store";
import {Overlay} from "./Dashboard";
import {Icon} from "./Button";
import {useLocation} from "react-router-dom";

export interface NavItem {
    icon?: MaterialIcon, // 隐藏的不需要
    name?: string, // 隐藏的也不需要
    rto?: string,
    clickFun?: Function, // 隐藏的也不需要
    component?:ReactNode
}

export interface NavProps {
    navList: NavItem[][],
    hidden_navList?: NavItem[],
    // nav_is_mobile: boolean,
    // nav_is_collapsed?: boolean,
}

export function Nav(props: NavProps) {
    const [navStyle, setNavStyle] = useAtom($stroe.nav_style);
    const location = useLocation();

    // 1. 使用 useMemo 动态计算当前激活项的 key，无需手动维护 state
    const activeKey = useMemo(() => {
        for (let i = 0; i < props.navList.length; i++) {
            for (let j = 0; j < props.navList[i].length; j++) {
                const item = props.navList[i][j];
                // 简单的路径匹配逻辑
                if (item?.rto && location.pathname.startsWith(item.rto.replace(/\*$/, ""))) {
                    return `${i}_${j}`;
                }
            }
        }
        return "0_0"; // 默认选中项
    }, [props.navList, location.pathname]);

    // 2. 合并关闭逻辑
    const toggleMobileNav = (open: boolean) => {
        setNavStyle((prev) => ({ ...prev, mobile_open: open }));
    };

    const handleLinkClick = (item: NavItem) => {
        if (item.clickFun) item.clickFun();
        if (window.innerWidth <= 736) toggleMobileNav(false);
    };

    return (
        <React.Fragment>
            <nav className={`
                ${navStyle.mobile_open ? "active" : ""} 
                ${navStyle.pc_collapsed ? "collapsed" : ""} 
                not-select-div
            `}>
                {props.navList.map((group, groupIndex) => (
                    <div key={groupIndex} className="nav_1">
                        {group.map((item, itemIndex) => {
                            const key = `${groupIndex}_${itemIndex}`;
                            return (
                                <To
                                    key={key}
                                    rto={item.rto}
                                    clickFun={() => handleLinkClick(item)}
                                    className={`nav_2 ${activeKey === key ? "nav_2_active" : ""}`}
                                >
                                    <Icon icon={item.icon} />
                                    <span className="nav_3">{item.name}</span>
                                </To>
                            );
                        })}
                    </div>
                ))}
            </nav>
            {navStyle.mobile_open && <Overlay className="layout-nav-overlay" click={() => toggleMobileNav(false)} />}
        </React.Fragment>
    );
}
