import React from 'react';
import { useAtom } from 'jotai';

import {$stroe} from "../../project/util/store";
// @ts-ignore
import logo  from "../resources/img/logo.svg"
import {ActionButton} from "./Button";
import {is_share} from "../../project/util/WebPath";

function Header(props: { ignore_tags?: boolean, children?: any, left_children?: any }) {
    const [headerMin, setHeaderMin] = useAtom($stroe.header_min);
    const [windows_width, set_windows_width] = useAtom($stroe.windows_width);
    const [nav_style,set_nav_style] = useAtom($stroe.nav_style);

    const mobile = () => {
        set_nav_style((prev) => ({...prev, mobile_open: true}))
    }

    const toggleNavCollapsed = () => {
        set_nav_style((prev) => ({...prev, pc_collapsed: !(prev.pc_collapsed ?? false)}))
    }

    return (
        <header className={`header not-select-div ${headerMin?"header-min":""}`}>
            {
                (!is_share() && props.ignore_tags !== true) &&
                <React.Fragment>
                    <div className={"header-menu"}>
                        <ActionButton icon={"menu"} title={"菜单"} onClick={mobile}/>
                    </div>
                    <div className={"header-nav-toggle"}>
                        <ActionButton
                            icon={"menu"}
                            title={(nav_style.pc_collapsed ?? false) ? "展开" : "收起"}
                            onClick={toggleNavCollapsed}
                        />
                    </div>
                </React.Fragment>
            }
            {props.ignore_tags !== true &&
                <h3><a href="https://github.com/xiaobaidadada/filecat" target="_blank"><img src={logo } alt="FileCat"/></a></h3>
                // <h3><a href="https://github.com/xiaobaidadada/filecat" target="_blank">{t("title")}</a></h3>
            }
            {
                props.left_children
            }
            {/*<title></title>*/}
            <div className={"title"}></div>
            {
                props.children
            }
        </header>
    );
}

export default Header;
