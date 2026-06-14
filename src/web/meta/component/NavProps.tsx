import React, {ReactNode, useEffect} from 'react';
// import '../resources/css/all.css'
import {MaterialIcon} from "material-icons";
import {To} from "./To";
import {get_filter_key, get_router_key_set, getRouterPath} from "../../project/util/WebPath";
import {useRecoilState} from "recoil";
import {$stroe} from "../../project/util/store";
import {Overlay} from "./Dashboard";
import {Icon} from "./Button";

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
    const [selectedIndex, setSelectedIndex] = React.useState("");
    const [nav_style, set_nav_style] = useRecoilState($stroe.nav_style);
    const closeMobileNav = () => {
        if (window.innerWidth <= 736) {
            set_nav_style((prev) => ({...prev, mobile_open: false}));
        }
    }
    useEffect(() => {
        let have = true;
        const set = get_router_key_set()
        for (let index = 0; index < props.navList.length; index++) {
            let ok = false;
            for (let i=0;i<props.navList[index].length;i++) {
                if (!props.navList[index][i]?.rto) {
                    continue;
                }
                const filter_key = get_filter_key(props.navList[index][i].rto)
                if (set.has(filter_key)) {
                    setSelectedIndex(`${index}_${i}`);
                    have = false;
                    ok = true;
                    break;
                }
            }
            if(ok)break;
        }
        if(have) {
            setSelectedIndex("0_0");
        }

    }, [props.navList]);

    const nav_close = () => {
        set_nav_style((prev) => ({...prev, mobile_open: false}))
    }

    return (
        <React.Fragment>
            <nav className={`${nav_style.mobile_open? "active" :""} ${nav_style.pc_collapsed ? "collapsed" : ""}  not-select-div`}>
                {props.navList.map((item, index) => {
                    return (<div key={index} className=" nav_1" >
                        {item.map((item2, index2) => {
                            return (
                                <To rto={item2.rto} key={index2} clickFun={() => {
                                    if(item2.clickFun) item2.clickFun();
                                    closeMobileNav();
                                }} className={` nav_2  ${selectedIndex === `${index}_${index2}` ? "nav_2_active" : ""}`}>
                                    <Icon icon={item2.icon}/>
                                    <span className=" nav_3">{item2.name}</span>
                                </To>)
                        })}
                    </div>)

                })}
            </nav>
            {nav_style.mobile_open && <Overlay className={"layout-nav-overlay"} click={nav_close}/>}
        </React.Fragment>
    );
}
