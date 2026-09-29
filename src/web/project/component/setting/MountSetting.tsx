import React, {useEffect} from "react";
import {useTranslation} from "react-i18next";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {Card} from "../../../meta/component/Card";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {HeaderPortal} from "../../../meta/component/HeaderPortal";
import {ActionButton} from "../../../meta/component/Button";
import {mountHttp} from "../../util/config";
import {NotySuccess} from "../../util/noty";
import {useAtom} from "jotai";
import {$stroe} from "../../util/store";
import CredentialPanel from "./mount/CredentialPanel";
import MountPanel from "./mount/MountPanel";
import BaiduPanel from "./mount/BaiduPanel";

/**
 * 网盘挂载设置页（独立路由：设置 → 网盘挂载）。
 *
 * 三块卡片：普通凭据管理、挂载列表、百度网盘。
 * 每块卡片上方平铺输入框新增，下方表格列出已有项可编辑/删除。
 */
export function MountSetting() {
    const {t} = useTranslation();
    const {check_user_auth} = use_auth_check();
    const can_manage = check_user_auth(UserAuth.file_mount);
    // 挂载功能总开关（顶部工具栏显示，只在本页出现）
    const [mount_enabled, set_mount_enabled] = useAtom<boolean | null>($stroe.mount_enabled);

    // 进入本页时拉取总开关状态
    useEffect(() => {
        if (!can_manage) {
            return;
        }
        (async () => {
            try {
                const rsp = await mountHttp.post("enabled/get", {});
                set_mount_enabled(rsp?.data === true);
            } catch (e) {
                // 拿不到状态时按关闭处理（默认关闭）
                set_mount_enabled(false);
            }
        })();
    }, [can_manage]);

    /** 切换挂载总开关 */
    const toggle_mount = async () => {
        const value = !mount_enabled;
        try {
            const rsp = await mountHttp.post("enabled/set", {enabled: value});
            const now = rsp?.data === true;
            set_mount_enabled(now);
            NotySuccess(now ? t("挂载已启用") : t("挂载已停用"));
        } catch (e) {
            // Http 层已提示
        }
    };

    if (!can_manage) {
        return (<Row>
            <Column>
                <Card self_title={<h2>{t("网盘挂载")}</h2>}>
                    <p>{t("nmuntpr")}</p>
                </Card>
            </Column>
        </Row>);
    }

    return (<React.Fragment>
        {/* 挂载总开关：注入到顶部工具栏，只在本页显示 */}
        <HeaderPortal position={"right"}>
            {/* 开关左边的文字标签：Header 里的 ActionButton 只显示图标（title 仅在 hover 时作为
                tooltip），不写文字用户不知道这个图标是干什么的 */}
            <span className={"header-label"}>{t("总开关")}</span>
            {/* 默认关闭，状态未加载完（null）时按「已停用」展示 */}
            <ActionButton icon={mount_enabled === true ? "cloud_done" : "cloud_off"}
                          title={mount_enabled === true ? t("muntont") : t("muntoff")}
                          selected={mount_enabled === true}
                          onClick={toggle_mount}/>
        </HeaderPortal>
        <Dashboard>

            <Row>
                <Column widthPer={50} maxWidth={"60rem"}>
                    <BaiduPanel on_credential_change={() => window.location.reload()}/>
                </Column>
                <Column widthPer={33} maxWidth={"30rem"} >
                    <CredentialPanel/>
                </Column>

            </Row>
            <Row>
                <Column widthPer={50} maxWidth={"60rem"}>
                    <MountPanel/>
                </Column>
            </Row>
        </Dashboard>
    </React.Fragment>);
}

export default MountSetting;
