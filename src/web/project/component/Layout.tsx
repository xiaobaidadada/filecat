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
import {Editor} from "./file/component/Editor";
import {Net} from "./net/Net";



function Layout() {

    function logout() {
        localStorage.setItem('token','')
    }
    const MainNavList:NavItem[][] = [
        [
            {icon: "folder", name: "文件夹", rto: "file/",},],
        [
            {icon: "home", name: "索引", rto: "navindex/"},
            {icon: "home_repair_service", name: "工具箱", rto: "toolbox/"},
            {icon: "computer", name: "系统信息", rto: "info/"},
            {icon: "cloud", name: "ddns", rto: "ddns/"},
        ],
        [
            {icon: "network_ping", name: "虚拟网络", rto: "net/"},
            {icon: "settings", name: "设置", rto: "setting/"},
            {icon: "logout", name: "退出登录",clickFun: logout,rto: "/"},
            // {component:(<div>测试</div>)}
        ]
    ]



    return (
        <div>
            {/*全局显示*/}
            <Prompt></Prompt>
            <Editor />
            {/*网页顶部菜单栏 | 不管什么位置都是位于顶部*/}
            <Header>
                <title><h3>FileCat</h3></title>
            </Header>
            <CommonBody navList={MainNavList}>
                {/*文件*/}
                <FileList/>
                {/*索引*/}
                <NavIndex />
                {/*工具箱*/}
                <ToolBox/>
                {/*系统信息*/}
                <SysInfo />
                {/*ddns*/}
                <Ddns />

                {/*网络*/}
                <Net/>
                {/*设置*/}
                <Settings />
            </CommonBody>
        </div>
    )
        ;
}

export default Layout;
