import React, {useContext} from 'react';
import {useAtom} from 'jotai';
import {useTranslation} from "react-i18next";
import {$stroe} from "../../util/store";
import {ZoomControl} from "../../../meta/component/ZoomControl";
import {GlobalContext} from "../../GlobalProvider";
import {userHttp} from "../../util/config";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {NotySuccess} from "../../util/noty";

/** ai 聊天记录缩放的取值范围与默认值 */
export const AI_CHAT_ZOOM_MIN = 30;
export const AI_CHAT_ZOOM_MAX = 200;
export const AI_CHAT_ZOOM_DEFAULT = 100;

/**
 * 打开 ai 聊天记录缩放的设置弹窗。
 * 复用通用的 ZoomControl。弹窗内改动即时反映到聊天区（atom 直接驱动样式），
 * 取消则回滚到打开前的值，确认才写入个人数据。
 */
export function use_ai_chat_zoom() {
    const {t} = useTranslation();
    const [, set_prompt_card] = useAtom($stroe.prompt_card);
    const [ai_chat_zoom, set_ai_chat_zoom] = useAtom($stroe.ai_chat_zoom);
    const {initUserInfo} = useContext(GlobalContext);

    const open = () => {
        // 打开时的值，取消时用它回滚
        const origin = ai_chat_zoom;
        const close = () => set_prompt_card({open: false});
        set_prompt_card({
            open: true,
            title: t("缩放调整"),
            // 这里不能传受控的 value：prompt_card 保存的是开弹窗那一刻的 element，
            // 外部值变化不会传导进来，控件会一直显示旧值
            context_div: <ZoomControl defaultValue={ai_chat_zoom} onChange={set_ai_chat_zoom}
                                      min={AI_CHAT_ZOOM_MIN} max={AI_CHAT_ZOOM_MAX}/>,
            cancel: () => {
                set_ai_chat_zoom(origin);
                close();
            },
            // prompt_card 保存的是开弹窗那一刻的闭包，读不到之后变化的值，
            // 因此用函数式更新取出当前值
            confirm: async () => {
                let value = AI_CHAT_ZOOM_DEFAULT;
                set_ai_chat_zoom(v => {
                    value = v < AI_CHAT_ZOOM_MIN || v > AI_CHAT_ZOOM_MAX ? AI_CHAT_ZOOM_DEFAULT : v;
                    return value;
                });
                await userHttp.post(Http_controller_router.user_save_private_attr, {is_ai_chat_zoom: true, ai_chat_zoom: value});
                NotySuccess(t("缩放调整成功"));
                initUserInfo();
                close();
            },
        });
    };

    return {open};
}
