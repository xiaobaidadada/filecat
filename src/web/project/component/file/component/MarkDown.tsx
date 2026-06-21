import React, {useEffect} from "react";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../../util/store";
import {ActionButton} from "../../../../meta/component/Button";
import Header from "../../../../meta/component/Header";
import {NotySucess} from "../../../util/noty";
import {join_url} from "../../../../../common/StringUtil";
import {copyToClipboard} from "../../../util/FunUtil";
import {useTranslation} from "react-i18next";
import {using_add_md__copy_button} from "../FileUtil";

const Md = React.lazy(() => import("./markdown/Md"));

export default function MarkDown(props) {
    const {t} = useTranslation();
    const [markdown, set_markdown] = useAtom($stroe.markdown)
    if (!markdown.context) {
        return;
    }

    function cancel() {
        set_markdown({context: "", filename: ""})
        markdown?.close?.()
    }


    return <div id={"md-container"}>
        <Header ignore_tags={true}
                left_children={[<ActionButton key={1} title={t("取消")} icon={"close"} onClick={cancel}/>,
                    <title key={2}>{markdown.filename}</title>]}>
        </Header>
        <div className={"md-context  "}>
            <Md context={markdown.context}/>
        </div>
    </div>
}
