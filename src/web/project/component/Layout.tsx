import React, {Suspense} from 'react'
import Header from "../../meta/component/Header";
import {CommonBody} from "../../meta/component/Body";
import {NavItem} from "../../meta/component/NavProps";
import {useRecoilState} from "recoil";
import {$stroe} from "../util/store";
import {routerConfig} from "../../../common/RouterConfig";
import {useTranslation} from "react-i18next";
import {use_auth_check} from "../util/store.util";
import {UserAuth} from "../../../common/req/user.req";
import {Overlay} from "../../meta/component/Dashboard";

const Ddns = React.lazy(() => import("./ddns/Ddns"))
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
const Settings = React.lazy(() => import("./setting/Setting"))
const NavIndex = React.lazy(() => import("./navindex/NavIndex"))
const FileLog = React.lazy(() => import("./file/component/LogViewer"))


function Layout() {
    const {t} = useTranslation();
    const [headerMin, setHeaderMin] = useRecoilState($stroe.header_min);
    const [image_editor, set_image_editor] = useRecoilState($stroe.image_editor);
    const [excalidraw_editor, set_excalidraw_editor] = useRecoilState($stroe.excalidraw_editor);
    const [custom_fun_opt,set_custom_fun_opt] = useRecoilState($stroe.custom_fun_opt);
    const [nav_style,set_nav_style] = useRecoilState($stroe.nav_style);
    const {check_user_auth} = use_auth_check();

    function logout() {
        localStorage.setItem('token', '')
    }
    const seconds:NavItem[] = [
        {icon: "favorite", name: t("网址导航"), rto: `${routerConfig.navindex}/`},
        {icon: "computer", name: t("系统"), rto: `${routerConfig.info}/`},
        {icon: "cell_tower", name: t("远程代理"), rto: `${routerConfig.proxy}/`},
        {icon: "home_repair_service", name: t("工具箱"), rto: `${routerConfig.toolbox}/`},
    ];
    if(check_user_auth(UserAuth.ddns)) {
        seconds.push({icon: "dns", name: "ddns", rto: `${routerConfig.ddns}/`})
    }
    let three:NavItem[] = [
        {icon: "settings", name: t("设置"), rto: `${routerConfig.setting}/`},
        {icon: "logout", name: t("退出登录"), clickFun: logout, rto: "/"},
        // {component:(<div>测试</div>)}
    ]
    if(check_user_auth(UserAuth.vir_net)) {
        three = [{icon: "vpn_lock", name: t("虚拟网络"), rto: `${routerConfig.net}/`},...three];
    }
    const MainNavList: NavItem[][] = [
        [
            {icon: "folder", name: t("文件"), rto: `${routerConfig.file}/`,},
        ],
        seconds,
        three
    ]
    if(custom_fun_opt) {
        // @ts-ignore
        MainNavList[MainNavList.length-1].push(custom_fun_opt);
    }
    const nav_close = () => {
        set_nav_style({is_mobile:false})
    }
    return (
        <div>
            {/*全局显示*/}
            <Suspense fallback={<div></div>}>
                <FileLog />
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
                <StudioLazy/>
            </Suspense>
            {image_editor.path !== undefined && <Suspense fallback={<div></div>}><ImageEditor/></Suspense>}
            {excalidraw_editor.path !== undefined && <Suspense fallback={<div></div>}>
                <ExcalidrawEditor/>
            </Suspense>}
            {/*网页顶部菜单栏 | 不管什么位置都是位于顶部*/}
            {!headerMin && <Header/>}
            <CommonBody navList={MainNavList} nav_is_mobile={nav_style.is_mobile}>
                {/*文件*/}
                <FileList/>
                {/*网站 索引*/}
                <NavIndex/>
                {/*系统信息*/}
                <Suspense fallback={<div></div>}>
                    <SysInfo/>
                </Suspense>
                {/*代理*/}
                <Suspense fallback={<div></div>}>
                    <Proxy />
                </Suspense>
                {/*工具箱*/}
                <Suspense fallback={<div></div>}>
                    <ToolBox/>
                </Suspense>
                {/*ddns*/}
                {check_user_auth(UserAuth.ddns) &&
                    <Suspense fallback={<div></div>}>
                        <Ddns/>
                    </Suspense>
                }
                {/*网络*/}
                {check_user_auth(UserAuth.vir_net) &&
                    <Suspense fallback={<div></div>}>
                        <Net/>
                    </Suspense>
                }
                {/*设置*/}
                <Suspense fallback={<div></div>}>
                    <Settings/>
                </Suspense>
            </CommonBody>
            {nav_style.is_mobile && <Overlay click={nav_close}/>}
        </div>
    )
        ;
}

export default Layout;
