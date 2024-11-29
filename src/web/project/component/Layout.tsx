import React, {Suspense, useEffect, useRef, useState} from 'react'
import '../../meta/resources/css/all.css'
import Header from "../../meta/component/Header";
import {CommonBody} from "../../meta/component/Body";
import {NavItem} from "../../meta/component/NavProps";

const Ddns = React.lazy(() => import("./ddns/Ddns"))
const FileList = React.lazy(() => import("./file/FileList"))
const Prompt = React.lazy(() => import("./prompts/Prompt"))
const ImageEditor = React.lazy(() => import("./file/component/image/ImageEditor"))
const ToolBox = React.lazy(() => import("./toolbox/ToolBox"))
const SysInfo = React.lazy(() => import("./sys/SysInfo"))
const FileEditor = React.lazy(() => import("./file/component/FileEditor"))
const Preview = React.lazy(() => import("./file/component/Preview"))
const MarkDown = React.lazy(() => import("./file/component/MarkDown"))
const ExcalidrawEditor = React.lazy(() => import("./file/component/ExcalidrawEditor"))
const Studio = React.lazy(() => import("./file/component/studio/Studio"))
const Net = React.lazy(() => import("./net/Net"))
const Settings = React.lazy(() => import("./setting/Setting"))
const NavIndex = React.lazy(() => import("./navindex/NavIndex"))
import {useRecoilState} from "recoil";
import {$stroe} from "../util/store";
import {routerConfig} from "../../../common/RouterConfig";
import {useTranslation} from "react-i18next";


function Layout() {
    const {t} = useTranslation();
    const [headerMin, setHeaderMin] = useRecoilState($stroe.header_min);
    const [image_editor, set_image_editor] = useRecoilState($stroe.image_editor);
    const [excalidraw_editor, set_excalidraw_editor] = useRecoilState($stroe.excalidraw_editor);
    const [custom_fun_opt,set_custom_fun_opt] = useRecoilState($stroe.custom_fun_opt);

    function logout() {
        localStorage.setItem('token', '')
    }

    const MainNavList: NavItem[][] = [
        [
            {icon: "folder", name: t("文件夹"), rto: `${routerConfig.file}/`,},],
        [
            {icon: "home", name: t("网站"), rto: `${routerConfig.navindex}/`},
            {icon: "home_repair_service", name: t("工具箱"), rto: `${routerConfig.toolbox}/`},
            {icon: "computer", name: t("系统信息"), rto: `${routerConfig.info}/`},
            {icon: "cloud", name: "ddns", rto: `${routerConfig.ddns}/`},
        ],
        [
            {icon: "network_ping", name: t("虚拟网络"), rto: `${routerConfig.net}/`},
            {icon: "settings", name: t("设置"), rto: `${routerConfig.setting}/`},
            {icon: "logout", name: t("退出登录"), clickFun: logout, rto: "/"},
            // {component:(<div>测试</div>)}
        ]
    ]
    if(custom_fun_opt) {
        // @ts-ignore
        MainNavList[MainNavList.length-1].push(custom_fun_opt);
    }


    return (
        <div>
            {/*全局显示*/}
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
                <Studio/>
            </Suspense>
            {image_editor.path !== undefined && <Suspense fallback={<div></div>}><ImageEditor/></Suspense>}
            {excalidraw_editor.path !== undefined && <Suspense fallback={<div></div>}>
                <ExcalidrawEditor/>
            </Suspense>}
            {/*网页顶部菜单栏 | 不管什么位置都是位于顶部*/}
            {!headerMin && <Header/>}
            <CommonBody navList={MainNavList}>
                {/*文件*/}
                <FileList/>
                {/*网站 索引*/}
                <NavIndex/>
                {/*工具箱*/}
                <ToolBox/>
                {/*系统信息*/}
                <SysInfo/>
                {/*ddns*/}
                <Ddns/>
                {/*网络*/}
                <Net/>
                {/*设置*/}
                <Settings/>
            </CommonBody>
        </div>
    )
        ;
}

export default Layout;
