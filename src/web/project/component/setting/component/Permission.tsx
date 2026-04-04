import React, {useContext, useEffect, useRef, useState} from 'react'
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {GlobalContext} from "../../../GlobalProvider";
import {useTranslation} from "react-i18next";
import {UserAuth} from "../../../../../common/req/user.req";
import {deleteList} from "../../../../../common/ListUtil";

export function Permission(props:{
    is_disable:(auth: UserAuth) => boolean;
    is_selected :(auth: UserAuth,not_root?:boolean)=>boolean; //not_root root 也要选中
    select_auth:(auth: UserAuth) => void;
}) {
    const {t, i18n} = useTranslation();
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);

    const list:{
        title: string,
        list:{
            title: string,
            permission:UserAuth,
            noDisable?:boolean // 强制 选择不隐藏 就算超级管理员也需要显示
        }[]
    } []= [
        {
            title: t("用户权限"),
            list: [
                { title: t("用户管理"), permission: UserAuth.user_manage },
                { title: t("角色管理"), permission: UserAuth.role_manage }
            ]
        },
        {
            title: t("系统管理权限"),
            list: [
                { title: t("系统信息"), permission: UserAuth.all_sys },
                { title: t("系统进程关闭"), permission: UserAuth.sys_process_close },
                { title: t("docker容器停止、删除"), permission: UserAuth.docker_container_update },
                { title: t("docker镜像删除"), permission: UserAuth.docker_images_delete },
                { title: t("systemd删除、添加管理"), permission: UserAuth.systemd_update }
            ]
        },
        {
            title: t("网络功能权限"),
            list: [
                { title: t("系统网络"), permission: UserAuth.vir_net },
                { title: "ddns", permission: UserAuth.ddns }
            ]
        },
        {
            title: t("Ai 设置权限"),
            list: [
                { title: t("Ai 配置"), permission: UserAuth.ai_agent_setting },
                { title: t("Ai Chat Page"), permission: UserAuth.ai_agent_page }
            ]
        },
        {
            title: t("文件权限"),
            list: [
                { title: t("文件删除、剪切、重命名"), permission: UserAuth.filecat_file_delete_cut_rename },
                { title: t("文件创建、上传、内容更新、解压缩"), permission: UserAuth.filecat_file_context_update_upload_created_copy_decompression },
                { title: t("内容更新"), permission: UserAuth.filecat_file_context_update },
                { title: t("文件回收站修改"), permission: UserAuth.recycle_file_save },
                { title: t("文件分享"), permission: UserAuth.share_file }
            ]
        },
        {
            title: t("系统设置权限"),
            list: [
                { title: t("token时间修改"), permission: UserAuth.token_update },
                { title: t("自定义auth"), permission: UserAuth.code_auth },
                { title: t("修改密码"), permission: UserAuth.update_password },
                { title: t("磁盘挂载"), permission: UserAuth.sys_disk_mount },
                { title: t("通用设置"), permission: UserAuth.sys_env_setting_key },
                { title: t("shell命令检测"), permission: UserAuth.shell_cmd_check },
            ]
        },
        {
            title: t("系统环境设置"),
            list: [
                { title: t("系统环境设置页面"), permission: UserAuth.sys_page },
                { title: t("目录文件上传数量限制修改"), permission: UserAuth.dir_upload_max_num },
                { title: t("PATH路径修改"), permission: UserAuth.env_path_update },
                { title: "pty cmd " + t("更新"), permission: UserAuth.pty_cmd_update },
                { title: "workflow job", permission: UserAuth.workflow_job },
                { title: t("系统保护路径更新"), permission: UserAuth.sys_protection_dir },
                { title: t("外部软件路径"), permission: UserAuth.outside_software_path }
            ]
        },
        {
            title: t("自定义路由"),
            list: [
                { title: t("自定义路由页面"), permission: UserAuth.auth_router_page },
                { title: t("workflow触发api 修改"), permission: UserAuth.workflow_api },
                { title: t("自定义资源路由"), permission: UserAuth.code_resource },
                { title: t("自定义api路由"), permission: UserAuth.code_api }
            ]
        },
        {
            title: t("标签编辑权限"),
            list: [
                { title: t("网址导航"), permission: UserAuth.net_site_tag_update },
                { title: t("ssh代理"), permission: UserAuth.ssh_proxy_tag_update },
                { title: t("http代理"), permission: UserAuth.http_proxy_tag_update },
                { title: t("浏览器代理"), permission: UserAuth.browser_proxy_tag_update },
                { title: t("rdp代理"), permission: UserAuth.rdp_proxy_tag_update },
                { title: t("网络唤醒"), permission: UserAuth.wol_proxy_tag_update },
                { title: t("rtsp播放器"), permission: UserAuth.rtsp_proxy_tag_update }
            ]
        },
        {
            title: t("代理功能"),
            list: [
                { title: t("ssh代理"), permission: UserAuth.ssh_proxy },
                { title: t("http代理"), permission: UserAuth.http_proxy },
                { title: t("http代理下载关闭"), permission: UserAuth.http_proxy_download_cancel },
                { title: t("浏览器代理"), permission: UserAuth.browser_proxy },
                { title: t("rdp代理"), permission: UserAuth.rdp_proxy }
            ]
        },
        {
            title: t("其他功能"),
            list: [
                { title: t("workflow 执行"), permission: UserAuth.workflow_exe },
                { title: t("workflow 执行用户"), permission: UserAuth.workflow_exe_user, noDisable: true },
                { title: t("网络唤醒"), permission: UserAuth.wol_proxy },
                { title: t("rtsp播放器"), permission: UserAuth.rtsp_proxy },
                { title: t("ssh密钥保存到磁盘"), permission: UserAuth.crypto_ssh_file },
                { title: t("网址导航"), permission: UserAuth.nav_net_tag },
                { title: t("filecat-restart重启命令"), permission: UserAuth.shell_cmd_filecat_restart },
                { title: t("filecat-upgrade升级命令"), permission: UserAuth.shell_cmd_filecat_upgrade },
                { title: t("filecat-down关闭主进程命令"), permission: UserAuth.shell_cmd_filecat_kill_self },
                { title: t("ai 命令(Ai 聊天)"), permission: UserAuth.ai_chat_cmd },
            ]
        }
    ];

    return (<React.Fragment>
        {list.map((group, i) => (
            <div key={i}>
                <h3>{group.title}</h3>

                {group.list.map((item, j) => {

                    return (
                        <div key={j}>
                            <input
                                type="checkbox"
                                disabled={
                                    item.noDisable
                                        ? false
                                        : props.is_disable(item.permission)
                                }
                                checked={props.is_selected(
                                    item.permission,
                                    item.noDisable
                                )}
                                onChange={() => {
                                    props.select_auth(item.permission);
                                }}
                            />
                            {item.title}
                        </div>
                    );
                })}
            </div>
        ))}
    </React.Fragment>)
}
