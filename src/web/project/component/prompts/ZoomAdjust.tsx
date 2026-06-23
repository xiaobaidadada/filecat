import React, {useContext, useEffect, useState} from 'react';
import { useAtom } from 'jotai';
import {$stroe} from "../../util/store";
import {CardPrompt} from "../../../meta/component/Card";
import {useTranslation} from "react-i18next";
import {Overlay} from "../../../meta/component/Dashboard";
import {InputText} from "../../../meta/component/Input";
import {GlobalContext} from "../../GlobalProvider";
import {userHttp} from "../../util/config";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {NotySuccess} from "../../util/noty";

export function ZoomAdjust() {
    const { t } = useTranslation();
    const [zoomPercent, setZoomPercent] = useAtom($stroe.zoom_style_by_percent);
    const [inputValue, setInputValue] = useState(zoomPercent.toString());
    const {initUserInfo} = useContext(GlobalContext);

    useEffect(() => {
        setInputValue(zoomPercent.toString());
    }, [zoomPercent]);

    const close = () => {
        setShowPrompt({show: false, type: "", overlay: false, data: {}});
    };

    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);

    const handleIncrement = () => {
        const newValue = Math.min(200, zoomPercent + 10);
        setZoomPercent(newValue);
    };

    const handleDecrement = () => {
        const newValue = Math.max(30, zoomPercent - 10);
        setZoomPercent(newValue);
    };

    const handleInputChange = (value: string) => {
        setInputValue(value);
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 30 && num <= 200) {
            setZoomPercent(num);
        }
    };

    const handleConfirm = async () => {
        let num = parseInt(inputValue, 10);
        if (!isNaN(num) && num >= 30 && num <= 200) {
            setZoomPercent(num);
        } else {
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
                context={[
                    <div key="zoom-control" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '0.5rem 0'
                    }}>

                        <button
                            className="button button--flat"
                            onClick={handleDecrement}
                            style={{minWidth: '2.5rem', height: '2.5rem', fontSize: '1.2rem'}}
                        >-</button>

                        <InputText
                            value={inputValue}
                            handleInputChange={handleInputChange}
                            placeholder={t("缩放百分比")}
                            width="6rem"
                        />
                        <span style={{fontSize: '0.9rem', color: 'var(--textSecondary)'}}>%</span>

                        <button
                            className="button button--flat"
                            onClick={handleIncrement}
                            style={{minWidth: '2.5rem', height: '2.5rem', fontSize: '1.2rem'}}
                        >+</button>

                    </div>,
                    <div key="zoom-range" style={{
                        fontSize: '0.8rem',
                        color: 'var(--textTertiary)',
                        marginTop: '0.5rem'
                    }}>
                        {t("范围")}: 30% - 200%
                    </div>
                ]}
            />
            <Overlay click={close} />
        </div>
    );
}