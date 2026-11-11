import React from "react";
import {useTranslation} from "react-i18next";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import MountPanel from "./mount/MountPanel";

/**
 * 网盘挂载设置页（独立路由：设置 → 网盘挂载）。
 *
 * 只管理「把某个凭据挂到哪个路径」，凭据本身在「网盘凭据」页维护。
 * 挂载总开关在挂载卡片标题栏，由 MountPanel 自己维护。
 */
export function MountSetting() {
    const {t} = useTranslation();
    const {check_user_auth} = use_auth_check();
    const can_manage = check_user_auth(UserAuth.file_mount);

    if (!can_manage) {
        return (<Row>
            <Column>
                <Card self_title={<h2>{t("网盘挂载")}</h2>}>
                    <p>{t("nmuntpr")}</p>
                </Card>
            </Column>
        </Row>);
    }

    return (<Dashboard>
        <Row>
            <Column widthPer={100} maxWidth={"90rem"}>
                <MountPanel/>
            </Column>
        </Row>
    </Dashboard>);
}

export default MountSetting;
