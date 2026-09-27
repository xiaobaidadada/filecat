import React from 'react';
import { useAtom } from 'jotai';

import {$stroe} from "../../project/util/store";
// @ts-ignore
import logo  from "../resources/img/logo.svg"
import {ActionButton} from "./Button";
import {is_share} from "../../project/util/WebPath";
import {Global} from "../../project/util/global";
import {PAGE_HEADER_SLOT_LEFT_ID, PAGE_HEADER_SLOT_RIGHT_ID} from "./HeaderPortal";


function Header(props: { ignore_tags?: boolean, permanent_logo?: boolean, left_children?: any, children?: any }) {
    const [headerMin, setHeaderMin] = useAtom($stroe.header_min);
    const [windows_width, set_windows_width] = useAtom($stroe.windows_width);
    const [nav_style,set_nav_style] = useAtom($stroe.nav_style);
    const [user_base_info] = useAtom($stroe.user_base_info);
    // 自定义网站 logo（在「通用设置」中配置）：
    // user_base_info.logo_url 是后端解析好的地址（http 远程地址或后端 logo 接口），
    // Global.logo_url 是服务端渲染注入的（登录页场景），都没配置时回退到内置默认 logo
    const custom_logo = user_base_info?.logo_url || Global.logo_url || logo;

    // 是否由本 Header 渲染 logo：需要展示 logo 区域，且被标记为常驻 Header
    const show_logo = props.ignore_tags !== true && props.permanent_logo === true;

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
                <h3>
                    {/* 只有常驻 Header（Layout）渲染唯一的 logo <img>；
                        页面内的 Header 不渲染，避免切换页面时 img 反复创建销毁 */}
                    {show_logo &&
                        <a href="https://github.com/xiaobaidadada/filecat" target="_blank">
                            <img src={custom_logo} alt="FileCat"/>
                        </a>
                    }
                </h3>
            }
            {/* 页面工具栏左侧注入槽位：页面用 <HeaderPortal> 把内容渲染到这里（对应原 left_children）
                只有常驻 Header（Layout 传 permanent_logo 的那个）才渲染槽位，
                避免页面内 Header 也渲染造成 id 重复 */}
            {props.ignore_tags !== true && props.permanent_logo === true &&
                <div id={PAGE_HEADER_SLOT_LEFT_ID} className={"header-slot"}></div>
            }
            {/*<title></title>*/}
            {
                // 全屏页（如 MarkDown）自己顶栏的左侧内容；普通页面已改用 <HeaderPortal> 注入
                props.left_children
            }
            <div className={"title"}></div>
            {/* 页面工具栏右侧注入槽位：对应原 children，渲染在 title 之后，保证按钮贴右 */}
            {props.ignore_tags !== true && props.permanent_logo === true &&
                <div id={PAGE_HEADER_SLOT_RIGHT_ID} className={"header-slot"}></div>
            }
            {
                props.children
            }
        </header>
    );
}

export default Header;
