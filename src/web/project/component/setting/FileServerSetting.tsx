import React from "react";
import {useTranslation} from "react-i18next";
import {Card} from "../../../meta/component/Card";
import {Row} from "../../../meta/component/Dashboard";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import FileServerPanel from "./FileServerPanel";

/**
 * 文件服务设置页。
 *
 * 把本地目录以 SMB / WebDAV / SFTP 协议对外提供，
 * 与「网盘挂载」方向相反。
 */
export function FileServerSetting() {
    const {t} = useTranslation();
    const {check_user_auth} = use_auth_check();

    if (!check_user_auth(UserAuth.file_mount)) {
        return (<Row>
            <Card self_title={<h2>{t("文件服务")}</h2>}>
                <p>{t("没有权限")}</p>
            </Card>
        </Row>);
    }

    return (<FileServerPanel/>);
}

export default FileServerSetting;
