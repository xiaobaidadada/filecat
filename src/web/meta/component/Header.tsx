import React from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../project/util/store";
// @ts-ignore
import logo  from "../resources/img/logo.svg"
import {ActionButton} from "./Button";
import {is_share} from "../../project/util/WebPath";

function Header(props: { ignore_tags?: boolean, children?: any, left_children?: any }) {
    const [headerMin, setHeaderMin] = useRecoilState($stroe.header_min);
    const [windows_width, set_windows_width] = useRecoilState($stroe.windows_width);
    const [nav_style,set_nav_style] = useRecoilState($stroe.nav_style);

    const mobile = () => {
        set_nav_style((prev) => ({...prev, open_menu: true}))
    }

    const toggleNavCollapsed = () => {
        set_nav_style((prev) => ({...prev, open_menu: !(prev.open_menu ?? true)}))
    }

    return (
        <header className={`header not-select-div ${headerMin?"header-min":""}`}>
            {
                !is_share() &&
                <React.Fragment>
                    <div className={"header-menu"}>
                        <ActionButton icon={"menu"} title={"菜单"} onClick={mobile}/>
                    </div>
                    <div className={"header-nav-toggle"}>
                        <ActionButton
                            icon={"menu"}
                            title={(nav_style.open_menu ?? true) ? "收起" : "展开"}
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
            <title></title>
            {
                props.children
            }
        </header>
    );
}

export default Header;
