import React, {useEffect, useRef, useState} from 'react'
import '../../meta/resources/css/all.css'
import Header from "../../meta/component/Header";
import {CommonBody} from "../../meta/component/Body";
import {FileList, FileListShowTypeEmum} from "./file/FileList";
import {Prompt, PromptEnum} from "./prompts/Prompt";
import {ToolBox} from "./toolbox/ToolBox";
import { NavItem} from "../../meta/component/NavProps";
import {SysInfo} from "./sys/SysInfo";
import {Ddns} from "./ddns/Ddns";
import {NavIndex} from "./navindex/NavIndex";
import {Settings} from "./setting/Setting";
import {FileEditor} from "./file/component/FileEditor";
import {Net} from "./net/Net";
import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../util/store";
import {Preview} from "./file/component/Preview";
import {MarkDown} from "./file/component/MarkDown";
import {Studio} from "./file/component/studio/Studio";
import "ace-builds/src-noconflict/theme-chaos";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/mode-text";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-ini";
import "ace-builds/src-noconflict/mode-c_cpp";
import "ace-builds/src-noconflict/mode-sh";
import "ace-builds/src-noconflict/mode-lua";
import "ace-builds/src-noconflict/mode-haml";
import "ace-builds/src-noconflict/mode-xml";
import "ace-builds/src-noconflict/mode-tsx";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/mode-sql";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-markdown";
import "ace-builds/src-noconflict/ext-language_tools";
import {ImageEditor} from "./file/component/image/ImageEditor";
import {ExcalidrawEditor} from "./file/component/ExcalidrawEditor";
import {routerConfig} from "../../../common/RouterConfig";

const ace = require("ace-builds/src-noconflict/ace");
ace.config.set(
    "basePath",
    "https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/"
);
ace.config.setModuleUrl(
    "ace/mode/javascript_worker",
    "https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/worker-javascript.js"
);


function Layout() {
    const { t } = useTranslation();
    const [headerMin, setHeaderMin] = useRecoilState($stroe.header_min);
    const [image_editor, set_image_editor] = useRecoilState($stroe.image_editor);
    const [excalidraw_editor, set_excalidraw_editor] = useRecoilState($stroe.excalidraw_editor);

    function logout() {
        localStorage.setItem('token','')
    }
    const MainNavList:NavItem[][] = [
        [
            {icon: "folder", name: t("文件夹"), rto: `${routerConfig.file}/`,},],
        [
            {icon: "home", name: t("索引"), rto: `${routerConfig.navindex}/`},
            {icon: "home_repair_service", name: t("工具箱"), rto: `${routerConfig.toolbox}/`},
            {icon: "computer", name: t("系统信息"), rto: `${routerConfig.info}/`},
            {icon: "cloud", name: "ddns", rto: `${routerConfig.ddns}/`},
        ],
        [
            {icon: "network_ping", name: t("虚拟网络"), rto: `${routerConfig.net}/`},
            {icon: "settings", name: t("设置"), rto: `${routerConfig.setting}/`},
            {icon: "logout", name: t("退出登录"),clickFun: logout,rto: "/"},
            // {component:(<div>测试</div>)}
        ]
    ]



    return (
        <div>
            {/*全局显示*/}
            <Prompt></Prompt>
            <FileEditor/>
            <Preview/>
            <MarkDown/>
            <Studio/>
            {image_editor.path !== undefined && <ImageEditor/>}
            {excalidraw_editor.path !== undefined && <ExcalidrawEditor />}
            {/*网页顶部菜单栏 | 不管什么位置都是位于顶部*/}
            {!headerMin && <Header/>}
            <CommonBody navList={MainNavList}>
                {/*文件*/}
                <FileList/>
                {/*索引*/}
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
