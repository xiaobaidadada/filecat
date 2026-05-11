import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import React, {useEffect, useMemo, useState} from "react";
import {ActionButton} from "../../../meta/component/Button";

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

export type PromptPageItem = {
    id: string;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    detail?: React.ReactNode;
    meta?: React.ReactNode;
};

export function SwitchPagePrompt(props: {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    pages: PromptPageItem[];
    initialPageId?: string;
    onClose?: () => void;
    onRefresh?: () => Promise<void>;
    renderPage: (page: PromptPageItem | undefined) => React.ReactNode;
}) {
    const {t} = useTranslation();
    const firstPageId = props.pages?.[0]?.id ?? "";
    const [selectedPageId, setSelectedPageId] = useState<string>(props.initialPageId ?? firstPageId);

    useEffect(() => {
        setSelectedPageId(props.initialPageId ?? firstPageId);
    }, [props.initialPageId, firstPageId, props.pages?.length]);

    const selectedPage = useMemo(
        () => props.pages?.find((page) => page.id === selectedPageId) ?? props.pages?.[0],
        [props.pages, selectedPageId]
    );

    return (
        <div className="prompt-switch-page">
            <div className="prompt-switch-page__header">
                <div>
                    <div className="prompt-switch-page__title">{props.title ?? t("信息")}</div>
                    {props.subtitle && <div className="prompt-switch-page__meta">{props.subtitle}</div>}
                </div>
                <div className="prompt-switch-page__actions">
                    {props.onRefresh && <ActionButton icon={"refresh"} title={t("刷新")} onClick={async () => {
                        await props.onRefresh?.();
                    }}/>}
                    {props.onClose && <ActionButton icon={"close"} title={t("关闭")} onClick={props.onClose}/>}
                </div>
            </div>

            <div className="prompt-switch-page__body">
                <div className="prompt-switch-page__nav">
                    {props.pages?.length ? props.pages.map((page) => (
                        <button
                            key={page.id}
                            className={`button button--flat button--grey prompt-switch-page__nav-item${selectedPage?.id === page.id ? " is-active" : ""}`}
                            onClick={() => setSelectedPageId(page.id)}
                        >
                            <div className="prompt-switch-page__nav-item-title">{page.title}</div>
                            {page.subtitle && <div className="prompt-switch-page__nav-item-subtitle">{page.subtitle}</div>}
                        </button>
                    )) : <div className="prompt-switch-page__empty">{t("暂无数据")}</div>}
                </div>

                <div className="prompt-switch-page__content">
                    {selectedPage ? props.renderPage(selectedPage) : <div className="prompt-switch-page__empty">{t("暂无数据")}</div>}
                </div>
            </div>
        </div>
    );
}

