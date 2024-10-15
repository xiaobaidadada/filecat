import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import React from "react";

export function PromptCard() {
    const { t } = useTranslation();
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.prompt_card);

    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{showPrompt.title ?? t("验证执行")}</h2>
        </div>
        {showPrompt.context_div}
    </div>)
}