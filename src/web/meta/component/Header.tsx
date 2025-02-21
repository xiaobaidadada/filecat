import React from 'react';
import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../project/util/store";
// @ts-ignore
import logo  from "../resources/img/logo.svg"
import {ActionButton} from "./Button";

function Header(props: { ignore_tags?: boolean, children?: any, left_children?: any }) {
    const { t } = useTranslation();
    const [headerMin, setHeaderMin] = useRecoilState($stroe.header_min);
    const [windows_width, set_windows_width] = useRecoilState($stroe.windows_width);
    const [nav_style,set_nav_style] = useRecoilState($stroe.nav_style);

    const mobile = () => {
        set_nav_style({is_mobile:true})
    }

    return (
        <header className={`header not-select-div ${headerMin?"header-min":""}`}>
            <div className={"header-menu"}>
                <ActionButton icon={"menu"} title={"菜单"} onClick={mobile}/>
            </div>
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
