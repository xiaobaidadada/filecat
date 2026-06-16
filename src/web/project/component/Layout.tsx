import React, {Suspense, useEffect, useState} from 'react'
import Header from "../../meta/component/Header";
import {CommonBody} from "../../meta/component/Body";
import {NavItem} from "../../meta/component/NavProps";
import {useRecoilState} from "recoil";
import {$stroe} from "../util/store";
import {routerConfig} from "../../../common/RouterConfig";
import {useTranslation} from "react-i18next";
import {get_proxy_menuRots, use_auth_check} from "../util/store.util";
import {UserAuth} from "../../../common/req/user.req";
import {Overlay} from "../../meta/component/Dashboard";
import CookieUtils from "../util/cookie";


const FileList = React.lazy(() => import("./file/FileList"))
const Prompt = React.lazy(() => import("./prompts/Prompt"))
const ImageEditor = React.lazy(() => import("./file/component/image/ImageEditor"))
const ToolBox = React.lazy(() => import("./toolbox/ToolBox"))
const Proxy = React.lazy(() => import("./proxy/Proxy"))
const SysInfo = React.lazy(() => import("./sys/SysInfo"))
const FileEditor = React.lazy(() => import("./file/component/FileEditor"))
const Preview = React.lazy(() => import("./file/component/Preview"))
const MarkDown = React.lazy(() => import("./file/component/MarkDown"))
const ExcalidrawEditor = React.lazy(() => import("./file/component/ExcalidrawEditor"))
const StudioLazy = React.lazy(() => import("./file/component/studio/StudioLazy"))
const Net = React.lazy(() => import("./net/Net"))
const TcpProxy = React.lazy(() => import("./net/tcp_proxy/TcpProxy"))
const Settings = React.lazy(() => import("./setting/Setting"))
const NavIndex = React.lazy(() => import("./navindex/NavIndex"))
const FileLog = React.lazy(() => import("./file/component/LogViewer"))
const ChatPage =   React.lazy(()=> import('./aichat/page/AiAgentChatPage'))
const Share = React.lazy(()=> import('./file/component/share/Share'))
const ShareListSetting = React.lazy(()=> import('./file/component/share/ShareListSetting'))
const AIAgentChatSetting = React.lazy(()=> import('./aichat/AIAgentChatSetting'))
const FileShell = React.lazy(() => import("./shell/FileShell"));
const SqliteQuery = React.lazy(() => import("./file/component/./DbQuery"));

function Layout() {
    const {t} = useTranslation();
    const [headerMin, setHeaderMin] = useRecoilState($stroe.header_min);
    const [image_editor, set_image_editor] = useRecoilState($stroe.image_editor);
    const [excalidraw_editor, set_excalidraw_editor] = useRecoilState($stroe.excalidraw_editor);
    const [custom_fun_opt, set_custom_fun_opt] = useRecoilState($stroe.custom_fun_opt);
    // const [nav_style, set_nav_style] = useRecoilState($stroe.nav_style);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const {check_user_auth} = use_auth_check();
    const have_proxy_menuRots= get_proxy_menuRots()

    function logout() {
        localStorage.setItem('token', '')
    }

    const seconds: NavItem[] = []
    if (check_user_auth(UserAuth.nav_net_tag)) {
        seconds.push({icon: "favorite", name: t("网址导航"), rto: `${routerConfig.navindex}/`, component: <NavIndex/>})
    }
    if (check_user_auth(UserAuth.all_sys)) {
        seconds.push({icon: "computer", name: t("系统"), rto: `${routerConfig.info}/`, component: <SysInfo/>})
    }
    if (have_proxy_menuRots) {
        seconds.push({icon: "cell_tower", name: t("远程代理"), rto: `${routerConfig.proxy}/`, component: <Proxy />})
    }
    // @ts-ignore
    seconds.push(...[
        {icon: "home_repair_service", name: t("工具箱"), rto: `${routerConfig.toolbox}/`, component: <ToolBox/>}
    ])

    let three: NavItem[] = [
        {icon: "settings", name: t("设置"), rto: `${routerConfig.setting}/`, component: <Settings/>},
        {icon: "logout", name: t("退出登录"), clickFun: logout, rto: "/"},
        // {component:(<div>测试</div>)}
    ]
    if (check_user_auth(UserAuth.vir_net) || check_user_auth(UserAuth.ddns) ) {
        three = [
            {icon: "dns", name: t("系统网络"), rto: `${routerConfig.net}/`, component: <Net/>},
            ...three
        ];
    }
    if (check_user_auth(UserAuth.tcp_proxy)) {
        three = [
            {icon: "vpn_lock", name: t("内网穿透"), rto: `${routerConfig.net_proxy}/`, component: <TcpProxy/>},
            ...three
        ];
    }
    const main_list:NavItem[] = [
            {icon: "folder", name: t("文件"), rto: `${routerConfig.file}/`, component: <FileList/>},
        ]
    if (check_user_auth(UserAuth.ai_agent_page)) {
        main_list.push({icon: "question_answer", name: t("AI"), rto: `${routerConfig.aichat}/`, component: <ChatPage />})
    }
    const MainNavList: NavItem[][] = [
        main_list,
        seconds,
        three
    ]
    const hidden_navList : NavItem[][] = [
        [
            { rto: `${routerConfig.share}/`, component: <Share />},
            { rto: `${routerConfig.share_list_setting_page}/`, component: <ShareListSetting />},
            { rto: `${routerConfig.ai_agent_setting_page}/`, component: <AIAgentChatSetting />},
            { rto: `${routerConfig.sqlite_query_page}/`, component: <SqliteQuery />},
            { rto: `${routerConfig.studio_page}/`, component: <StudioLazy />}
        ]
    ]
    if(user_base_info.sys_env?.show_login_user_info) {
        MainNavList[MainNavList.length-1].push({name:user_base_info.user_data.note??user_base_info.user_data.username,icon:"person",rto:'/setting/private_env_setting'})
    }
    if(CookieUtils.has('tcp_client_num_id')) {
        MainNavList[MainNavList.length-1].push({name:t('代理退出'),icon:"cookie",clickFun:()=>{
                CookieUtils.delete('tcp_client_num_id')
                window.location.reload();
            }})
    }
    if (custom_fun_opt) {
        // @ts-ignore
        MainNavList[MainNavList.length - 1].push(custom_fun_opt);
    }
    // const pcCollapsed = nav_style?.pc_collapsed ?? false;

    return (
        <React.Fragment>
            {/*全局显示*/}
            <Suspense fallback={<div></div>}>
                <FileLog/>
            </Suspense>
            <Suspense fallback={<div></div>}>
                <Prompt></Prompt>
            </Suspense>
            <Suspense fallback={<div></div>}>
                <FileEditor/>
            </Suspense>
            <Suspense fallback={<div></div>}>
                <Preview/>
            </Suspense>
            <Suspense fallback={<div></div>}>
                <MarkDown/>
            </Suspense>
            <Suspense fallback={<div></div>}>
                <FileShell/>
            </Suspense>
            {image_editor.path !== undefined && <Suspense fallback={<div></div>}><ImageEditor/></Suspense>}
            {excalidraw_editor.url !== undefined && <Suspense fallback={<div></div>}>
                <ExcalidrawEditor/>
            </Suspense>}
            {/*网页顶部菜单栏 | 不管什么位置都是位于顶部*/}
            {!headerMin && <Header/>}
            <CommonBody
                navList={MainNavList}
                hidden_navList={hidden_navList}
                // nav_is_mobile={mobileOpen}
                // nav_is_collapsed={pcCollapsed}
            />
        </React.Fragment>
    )
        ;
}

export default Layout;
