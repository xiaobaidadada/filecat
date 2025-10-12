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
    

    return (<React.Fragment>
        <h3>{t("功能权限")}</h3>
        <div className={"checkbox_container"}>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.user_manage)}
                       checked={props.is_selected(UserAuth.user_manage)} onChange={() => {
                    props.select_auth(UserAuth.user_manage)
                }}/>
                {t("用户管理")}
            </div>
            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.role_manage)}
                       checked={props.is_selected(UserAuth.role_manage)}
                       onChange={() => {
                           props.select_auth(UserAuth.role_manage)
                       }}/>
                {t("角色管理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.sys_process_close)}
                       checked={props.is_selected(UserAuth.sys_process_close)} onChange={() => {
                    props.select_auth(UserAuth.sys_process_close)
                }}/>
                {t("系统进程关闭")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.docker_container_update)}
                       checked={props.is_selected(UserAuth.docker_container_update)} onChange={() => {
                    props.select_auth(UserAuth.docker_container_update)
                }}/>
                {t("docker容器停止、删除")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.docker_images_delete)}
                       checked={props.is_selected(UserAuth.docker_images_delete)} onChange={() => {
                    props.select_auth(UserAuth.docker_images_delete)
                }}/>
                {t("docker镜像删除")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.systemd_update)}
                       checked={props.is_selected(UserAuth.systemd_update)} onChange={() => {
                    props.select_auth(UserAuth.systemd_update)
                }}/>
                {t("systemd删除、添加管理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.vir_net)}
                       checked={props.is_selected(UserAuth.vir_net)} onChange={() => {
                    props.select_auth(UserAuth.vir_net)
                }}/>
                {t("虚拟网络")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.token_update)}
                       checked={props.is_selected(UserAuth.token_update)} onChange={() => {
                    props.select_auth(UserAuth.token_update)
                }}/>
                {t("token时间修改")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.code_auth)}
                       checked={props.is_selected(UserAuth.code_auth)} onChange={() => {
                    props.select_auth(UserAuth.code_auth)
                }}/>
                {t("自定义auth")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.code_resource)}
                       checked={props.is_selected(UserAuth.code_resource)} onChange={() => {
                    props.select_auth(UserAuth.code_resource)
                }}/>
                {t("自定义资源路由")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.code_api)}
                       checked={props.is_selected(UserAuth.code_api)} onChange={() => {
                    props.select_auth(UserAuth.code_api)
                }}/>
                {t("自定义api路由")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.update_password)}
                       checked={props.is_selected(UserAuth.update_password)} onChange={() => {
                    props.select_auth(UserAuth.update_password)
                }}/>
                {t("修改密码")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.sys_disk_mount)}
                       checked={props.is_selected(UserAuth.sys_disk_mount)} onChange={() => {
                    props.select_auth(UserAuth.sys_disk_mount)
                }}/>
                {t("磁盘挂载")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.ddns)}
                       checked={props.is_selected(UserAuth.ddns)} onChange={() => {
                    props.select_auth(UserAuth.ddns)
                }}/>
                ddns
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.outside_software_path)}
                       checked={props.is_selected(UserAuth.outside_software_path)} onChange={() => {
                    props.select_auth(UserAuth.outside_software_path)
                }}/>
                {t("外部软件路径")}
            </div>
            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.filecat_file_context_update)}
                       checked={props.is_selected(UserAuth.filecat_file_context_update)}
                       onChange={() => {
                           props.select_auth(UserAuth.filecat_file_context_update)
                       }}/>
                {t("内容更新")}
            </div>
            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.shell_cmd_check)}
                       checked={props.is_selected(UserAuth.shell_cmd_check)}
                       onChange={() => {
                           props.select_auth(UserAuth.shell_cmd_check)
                       }}/>
                {t("shell命令检测")}
            </div>
            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.env_path_update)}
                       checked={props.is_selected(UserAuth.env_path_update)}
                       onChange={() => {
                           props.select_auth(UserAuth.env_path_update)
                       }}/>
                {t("PATH路径修改")}
            </div>
            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.pty_cmd_update)}
                       checked={props.is_selected(UserAuth.pty_cmd_update)}
                       onChange={() => {
                           props.select_auth(UserAuth.pty_cmd_update)
                       }}/>
                {"pty cmd " +t("更新")}
            </div>
            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.sys_protection_dir)}
                       checked={props.is_selected(UserAuth.sys_protection_dir)}
                       onChange={() => {
                           props.select_auth(UserAuth.sys_protection_dir)
                       }}/>
                {t("系统保护路径更新")}
            </div>

            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.workflow_exe)}
                       checked={props.is_selected(UserAuth.workflow_exe)}
                       onChange={() => {
                           props.select_auth(UserAuth.workflow_exe)
                       }}/>
                {t("workflow ")+t("执行")}
            </div>
            <div>
                <input type="checkbox"
                       checked={props.is_selected(UserAuth.workflow_exe_user, true)}
                       onChange={() => {
                           props.select_auth(UserAuth.workflow_exe_user)
                       }}/>
                {t("workflow ")+t("执行用户")}
            </div>
            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.workflow_api)}
                       checked={props.is_selected(UserAuth.workflow_api)}
                       onChange={() => {
                           props.select_auth(UserAuth.workflow_api)
                       }}/>
                {t("workflow触发api 修改")}
            </div>
            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.dir_upload_max_num)}
                       checked={props.is_selected(UserAuth.dir_upload_max_num)}
                       onChange={() => {
                           props.select_auth(UserAuth.dir_upload_max_num)
                       }}/>
                {t("目录文件上传数量限制修改")}
            </div>
            <div>
                <input type="checkbox"
                       disabled={props.is_disable(UserAuth.sys_env_setting_key)}
                       checked={props.is_selected(UserAuth.sys_env_setting_key)}
                       onChange={() => {
                           props.select_auth(UserAuth.sys_env_setting_key)
                       }}/>
                {t("通用设置")}
            </div>
        </div>

        <h3>{t("文件权限")}</h3>
        <div>
            <input type="checkbox" disabled={props.is_disable(UserAuth.filecat_file_delete_cut_rename)}
                   checked={props.is_selected(UserAuth.filecat_file_delete_cut_rename)} onChange={() => {
                props.select_auth(UserAuth.filecat_file_delete_cut_rename)
            }}/>
            {t("文件删除、剪切、重命名")}
        </div>
        <div>
            <input type="checkbox"
                   disabled={props.is_disable(UserAuth.filecat_file_context_update_upload_created_copy_decompression)}
                   checked={props.is_selected(UserAuth.filecat_file_context_update_upload_created_copy_decompression)}
                   onChange={() => {
                       props.select_auth(UserAuth.filecat_file_context_update_upload_created_copy_decompression)
                   }}/>
            {t("文件创建、上传、内容更新、解压缩")}
        </div>
        <div>
            <input type="checkbox"
                   disabled={props.is_disable(UserAuth.recycle_file_save)}
                   checked={props.is_selected(UserAuth.recycle_file_save)}
                   onChange={() => {
                       props.select_auth(UserAuth.recycle_file_save)
                   }}/>
            {t("文件回收站修改")}
        </div>


        <h3>{t("标签编辑权限")}</h3>
        <div className={"checkbox_container"}>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.net_site_tag_update)}
                       checked={props.is_selected(UserAuth.net_site_tag_update)} onChange={() => {
                    props.select_auth(UserAuth.net_site_tag_update)
                }}/>
                {t("网址")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.ssh_proxy_tag_update)}
                       checked={props.is_selected(UserAuth.ssh_proxy_tag_update)} onChange={() => {
                    props.select_auth(UserAuth.ssh_proxy_tag_update)
                }}/>
                {t("ssh代理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.http_proxy_tag_update)}
                       checked={props.is_selected(UserAuth.http_proxy_tag_update)} onChange={() => {
                    props.select_auth(UserAuth.http_proxy_tag_update)
                }}/>
                {t("http代理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.browser_proxy_tag_update)}
                       checked={props.is_selected(UserAuth.browser_proxy_tag_update)} onChange={() => {
                    props.select_auth(UserAuth.browser_proxy_tag_update)
                }}/>
                {t("浏览器代理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.rdp_proxy_tag_update)}
                       checked={props.is_selected(UserAuth.rdp_proxy_tag_update)} onChange={() => {
                    props.select_auth(UserAuth.rdp_proxy_tag_update)
                }}/>
                {t("rdp代理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.wol_proxy_tag_update)}
                       checked={props.is_selected(UserAuth.wol_proxy_tag_update)} onChange={() => {
                    props.select_auth(UserAuth.wol_proxy_tag_update)
                }}/>
                {t("网络唤醒")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.rtsp_proxy_tag_update)}
                       checked={props.is_selected(UserAuth.rtsp_proxy_tag_update)} onChange={() => {
                    props.select_auth(UserAuth.rtsp_proxy_tag_update)
                }}/>
                {t("rtsp播放器")}
            </div>

            <h3>{t("工具功能")}</h3>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.ssh_proxy)}
                       checked={props.is_selected(UserAuth.ssh_proxy)} onChange={() => {
                    props.select_auth(UserAuth.ssh_proxy)
                }}/>
                {t("ssh代理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.http_proxy)}
                       checked={props.is_selected(UserAuth.http_proxy)} onChange={() => {
                    props.select_auth(UserAuth.http_proxy)
                }}/>
                {t("http代理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.http_proxy_download_cancel)}
                       checked={props.is_selected(UserAuth.http_proxy_download_cancel)} onChange={() => {
                    props.select_auth(UserAuth.http_proxy_download_cancel)
                }}/>
                {t("http代理下载关闭")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.browser_proxy)}
                       checked={props.is_selected(UserAuth.browser_proxy)} onChange={() => {
                    props.select_auth(UserAuth.browser_proxy)
                }}/>
                {t("浏览器代理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.rdp_proxy)}
                       checked={props.is_selected(UserAuth.rdp_proxy)} onChange={() => {
                    props.select_auth(UserAuth.rdp_proxy)
                }}/>
                {t("rdp代理")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.wol_proxy)}
                       checked={props.is_selected(UserAuth.wol_proxy)} onChange={() => {
                    props.select_auth(UserAuth.wol_proxy)
                }}/>
                {t("网络唤醒")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.rtsp_proxy)}
                       checked={props.is_selected(UserAuth.rtsp_proxy)} onChange={() => {
                    props.select_auth(UserAuth.rtsp_proxy)
                }}/>
                {t("rtsp播放器")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.crypto_ssh_file)}
                       checked={props.is_selected(UserAuth.crypto_ssh_file)} onChange={() => {
                    props.select_auth(UserAuth.crypto_ssh_file)
                }}/>
                {t("ssh密钥保存到磁盘")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.nav_net_tag)}
                       checked={props.is_selected(UserAuth.nav_net_tag)} onChange={() => {
                    props.select_auth(UserAuth.nav_net_tag)
                }}/>
                {t("网址导航")}
            </div>
            <div>
                <input type="checkbox" disabled={props.is_disable(UserAuth.all_sys)}
                       checked={props.is_selected(UserAuth.all_sys)} onChange={() => {
                    props.select_auth(UserAuth.all_sys)
                }}/>
                {t("系统")}
            </div>
        </div>
    </React.Fragment>)
}
