import React, {useContext} from 'react';
import { useAtom } from 'jotai';
import {$stroe} from "../../util/store";
import {CardPrompt} from "../../../meta/component/Card";
import {useTranslation} from "react-i18next";
import {Overlay} from "../../../meta/component/Dashboard";
import {ZoomControl} from "../../../meta/component/ZoomControl";
import {GlobalContext} from "../../GlobalProvider";
import {userHttp} from "../../util/config";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {NotySuccess} from "../../util/noty";

export function ZoomAdjust() {
    const { t } = useTranslation();
    const [zoomPercent, setZoomPercent] = useAtom($stroe.zoom_style_by_percent);
    const {initUserInfo} = useContext(GlobalContext);

    const close = () => {
        setShowPrompt({show: false, type: "", overlay: false, data: {}});
    };

    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);

    const handleConfirm = async () => {
        let num = zoomPercent;
        if (isNaN(num) || num < 30 || num > 200) {
            num = 100
            setZoomPercent(num);
        }
        await userHttp.post(Http_controller_router.user_save_private_attr, {is_file_list_zoom:true,value:num});
        NotySuccess(t("缩放调整成功"));
        initUserInfo();
        close();
    };

    return (
        <div>
            <CardPrompt
                title={t("缩放调整")}
                cancel={close}
                confirm={handleConfirm}
                cancel_t={t("取消")}
                confirm_t={t("确定")}
                context={
                    <ZoomControl defaultValue={zoomPercent} onChange={setZoomPercent}/>
                }
            />
            <Overlay click={close} />
        </div>
    );
}