import React from 'react';
import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../project/util/store";
// @ts-ignore
import logo  from "../resources/img/logo.svg"

function Header(props: { ignore_tags?: boolean, children?: any, left_children?: any }) {
    const { t } = useTranslation();
    const [headerMin, setHeaderMin] = useRecoilState($stroe.header_min);
    return (
        <header className={`header not-select-div ${headerMin?"header-min":""}`}>
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
