import React from 'react'
import { useAtom } from 'jotai';
import {$stroe} from "../../../util/store";
import {useTranslation} from "react-i18next";
import {UserAuth} from "../../../../../common/req/user.req";

export function Permission(props:{
    is_disable:(auth: UserAuth) => boolean;
    is_selected :(auth: UserAuth,not_root?:boolean)=>boolean; //not_root root 也要选中
    select_auth:(auth: UserAuth) => void;
}) {
    const {t, i18n} = useTranslation();
    const [user_base_info,setUser_base_info] = useAtom($stroe.user_base_info);

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
                { title: t("dc_ctdl"), permission: UserAuth.docker_container_update },
                { title: t("dc_idl"), permission: UserAuth.docker_images_delete },
                { title: t("systemd管理"), permission: UserAuth.systemd },
                { title: t("防火墙管理"), permission: UserAuth.firewall }
            ]
        },
        {
            title: t("网络功能权限"),
            list: [
                { title: t("系统网络"), permission: UserAuth.vir_net },
                { title: t("内网穿透"), permission: UserAuth.tcp_proxy },
                { title: "ddns", permission: UserAuth.ddns }
            ]
        },
        {
            title: t("Ai 设置权限"),
            list: [
                { title: t("Ai 配置"), permission: UserAuth.ai_agent_setting },
                { title: t("ai_page"), permission: UserAuth.ai_agent_page },
                // 允许在 AI 聊天主页切换模型（聚合所有供应商模型的选择）
                { title: t("sw_mdl"), permission: UserAuth.ai_model_switch }
            ]
        },
        {
            title: t("文件权限"),
            list: [
                { title: t("log_del"), permission: UserAuth.filecat_file_delete_cut_rename },
                { title: t("log_wr"), permission: UserAuth.filecat_file_context_update_upload_created_copy_decompression },
                { title: t("内容更新"), permission: UserAuth.filecat_file_context_update },
                { title: t("文件回收站修改"), permission: UserAuth.recycle_file_save },
                { title: t("文件分享"), permission: UserAuth.share_file }
            ]
        },
        {
            title: t("系统设置权限"),
            list: [
                { title: t("系统页面"), permission: UserAuth.sys_setting_page },
                { title: t("htts"), permission: UserAuth.https_file },
                { title: t("tk_time"), permission: UserAuth.token_update },
                { title: t("修改密码"), permission: UserAuth.update_password },
                { title: t("磁盘挂载"), permission: UserAuth.sys_disk_mount },
                { title: t("通用设置"), permission: UserAuth.sys_env_setting_key },
                // md 编辑器全局设置（正文宽度/字号/行高等），影响所有用户
                { title: t("md_set"), permission: UserAuth.md_editor_setting },
                { title: t("目录挂载"), permission: UserAuth.file_mount },
            ]
        },
        {
            title: t("系统环境设置"),
            list: [
                { title: t("sys_env"), permission: UserAuth.sys_env_page },
                { title: t("up_lim"), permission: UserAuth.dir_upload_max_num },
                { title: t("path_md"), permission: UserAuth.env_path_update },
                { title: "pty cmd " + t("更新"), permission: UserAuth.pty_cmd_update },
                { title: "workflow job", permission: UserAuth.workflow_job },
                { title: t("path_up"), permission: UserAuth.sys_protection_dir },
                { title: t("外部软件路径"), permission: UserAuth.outside_software_path }
            ]
        },
        {
            title:t("个人环境设置"),
            list:[
                {title:t("个性化设置"),permission:UserAuth.private_sys_env}
            ]
        },
        {
            title: t("自定义路由"),
            list: [
                { title: t("自定义路由页面"), permission: UserAuth.auth_router_page },
                { title: t("wf_api"), permission: UserAuth.workflow_api },
                { title: t("自定义资源路由"), permission: UserAuth.code_resource },
                { title: t("api_rt"), permission: UserAuth.code_api }
            ]
        },
        {
            title: t("标签编辑权限"),
            list: [
                // { title: t("网址导航"), permission: UserAuth.net_site_tag_update },
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
                { title: t("pxy_off"), permission: UserAuth.http_proxy_download_cancel },
                { title: t("浏览器代理"), permission: UserAuth.browser_proxy },
                { title: t("rdp代理"), permission: UserAuth.rdp_proxy }
            ]
        },
        {
            title: t("其他功能"),
            list: [
                { title: t("wf_run"), permission: UserAuth.workflow_exe },
                { title: t("wf_user"), permission: UserAuth.workflow_exe_user, noDisable: true },
                { title: t("网络唤醒"), permission: UserAuth.wol_proxy },
                { title: t("端口扫描"), permission: UserAuth.port_scan },
                { title: t("rtsp播放器"), permission: UserAuth.rtsp_proxy },
                { title: t("ssh_sv"), permission: UserAuth.crypto_ssh_file },
                // { title: t("网址导航"), permission: UserAuth.nav_net_tag },
                { title: t("cmd_rst"), permission: UserAuth.shell_cmd_filecat_restart },
                { title: t("cmd_upg"), permission: UserAuth.shell_cmd_filecat_upgrade },
                { title: t("cmd_dwn"), permission: UserAuth.shell_cmd_filecat_kill_self },
                { title: t("cmd_ai"), permission: UserAuth.ai_chat_cmd },
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
