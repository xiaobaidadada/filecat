import React from 'react'

import {StatusCircle} from "../../../../../meta/component/Card";
import {running_type} from "../../../../../../common/req/file.req";
import {useTranslation} from "react-i18next";


export function WorkFlowStatus({ item }) {
    const { t } = useTranslation();

    let success
    let running
    if(item.code != null) {
        success = item.code === 0
    } else if(item.extra_data?.running_type === running_type.running) {
        running = true
    }

    return (
        <div>
            <StatusCircle
                success={success}
                running={running}
            />
            {success ? t("成功") : t("失败")}
        </div>
    );
}
