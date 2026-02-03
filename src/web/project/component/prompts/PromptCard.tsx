import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import React from "react";
import {CardPrompt} from "../../../meta/component/Card";

export function PromptCard() {
    const { t } = useTranslation();
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.prompt_card);
    const cancel = ()=>{
        if(showPrompt.cancel) showPrompt.cancel()
        setShowPrompt({open: false});
    }
    // return <CardPrompt
    // title={showPrompt.title} context={showPrompt.context_div} cancel={cancel} confirm={showPrompt.confirm}/>
    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{showPrompt.title ?? t("验证执行")}</h2>
        </div>
        <div className="card-content">
            {showPrompt.context_div}
        </div>
        <div className="card-action">
            {
                showPrompt.cancel &&
                <button className="button button--flat button--grey" onClick={cancel}>
                    {"cancel"}
                </button>
            }
            {
                showPrompt.confirm &&
                <button className="button button--flat" onClick={showPrompt.confirm}>
                    {"confirm"}
                </button>
            }
        </div>
    </div>)
}