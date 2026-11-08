import React from "react";
import {useTranslation} from "react-i18next";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import CredentialPanel from "./mount/CredentialPanel";

/**
 * 网盘凭据设置页（独立路由：设置 → 网盘凭据）。
 *
 * 只管理「怎么连上远端」的认证信息，不涉及挂载到哪里。
 */
export function CredentialSetting() {
    const {t} = useTranslation();
    const {check_user_auth} = use_auth_check();
    const can_manage = check_user_auth(UserAuth.file_mount);

    if (!can_manage) {
        return (<Row>
            <Column>
                <Card self_title={<h2>{t("网盘凭据")}</h2>}>
                    <p>{t("nmuntpr")}</p>
                </Card>
            </Column>
        </Row>);
    }

    return (<Dashboard>
        <Row>
            <Column widthPer={100} maxWidth={"90rem"}>
                <CredentialPanel/>
            </Column>
        </Row>
    </Dashboard>);
}

export default CredentialSetting;
