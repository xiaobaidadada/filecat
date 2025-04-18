import React, {useEffect} from "react";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {ActionButton} from "../../../../meta/component/Button";
import Header from "../../../../meta/component/Header";
import {NotySucess} from "../../../util/noty";
import {join_url} from "../../../../../common/StringUtil";
import {copyToClipboard} from "../../../util/FunUtil";
import {useTranslation} from "react-i18next";

const Md = React.lazy(() => import("./markdown/Md"));

export default function MarkDown(props) {
    const {t} = useTranslation();
    const [markdown, set_markdown] = useRecoilState($stroe.markdown)
    const copy = (text) => {
        copyToClipboard(text)
        NotySucess('复制成功');
    };
    useEffect(() => {
        // 在组件渲染完成后为复制按钮添加事件处理
        const copyButtons = document.querySelectorAll('.copy-btn');
        copyButtons.forEach(button => {
            button.addEventListener('click', function () {
                const code = this.getAttribute('data-code');
                copy(code);
            });
        });

        // 清理事件绑定，防止重复绑定
        return () => {
            copyButtons.forEach(button => {
                button.removeEventListener('click', function () {
                    const code = this.getAttribute('data-code');
                    copy(code);
                });
            });
        };
    }, [markdown]); // 每次 markdownText 改变时重新绑定事件
    if (!markdown.context) {
        return;
    }

    function cancel() {
        set_markdown({context: "", filename: ""})
    }


    return <div id={"md-container"}>
        <Header ignore_tags={true}
                left_children={[<ActionButton key={1} title={t("取消")} icon={"close"} onClick={cancel}/>,
                    <title key={2}>{markdown.filename}</title>]}>
        </Header>
        <div className={"md-context markdown-body "}>
            <Md context={markdown.context}/>
        </div>
    </div>
}
