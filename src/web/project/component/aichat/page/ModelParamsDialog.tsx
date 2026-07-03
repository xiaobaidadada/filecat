import React, { useState } from 'react';
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { ActionButton } from "../../../../meta/component/Button";
import { InputText } from "../../../../meta/component/Input";
import { $stroe } from "../../../util/store";

// ============================================================
//  图片参数配置弹窗 — 使用项目通用 card floating 样式
// ============================================================

function ImagesParamsDialog({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [params, setParams] = useAtom($stroe.ai_images_extra_params);
    const [size, setSize] = useState(params.size || "1024x1024");
    const [n, setN] = useState(String(params.n ?? 1));
    const [quality, setQuality] = useState(params.quality || "");
    const [style, setStyle] = useState(params.style || "");
    const [extraJson, setExtraJson] = useState(params.extra_json || "");

    const handleSave = () => {
        const newParams: Record<string, any> = { size, n: parseInt(n) || 1 };
        if (quality) newParams.quality = quality;
        if (style) newParams.style = style;
        if (extraJson) newParams.extra_json = extraJson;
        setParams(newParams);
        onClose();
    };

    return (
        <div className="card floating">
            <div className="card-title">
                <h2>{t("图片生成参数设置")}</h2>
            </div>
            <div className="card-content">
                <InputText
                    placeholderOut={t("图片尺寸 (size)")}
                    value={size}
                    handleInputChange={setSize}
                    placeholder="1024x1024"
                />
                <InputText
                    placeholderOut={t("生成数量 (n)")}
                    value={n}
                    handleInputChange={setN}
                    type="number"
                />
                <InputText
                    placeholderOut={t("画质 (quality)")}
                    value={quality}
                    handleInputChange={setQuality}
                    placeholder="standard / hd"
                />
                <InputText
                    placeholderOut={t("风格 (style)")}
                    value={style}
                    handleInputChange={setStyle}
                    placeholder="vivid / natural"
                />
                <InputText
                    placeholderOut={t("额外参数 JSON")}
                    value={extraJson}
                    handleInputChange={setExtraJson}
                    placeholder='{"key":"value"}'
                />
            </div>
            <div className="card-action">
                <button className="button button--flat button--grey" onClick={onClose}>
                    {t("取消")}
                </button>
                <button className="button button--flat" onClick={handleSave}>
                    {t("确定")}
                </button>
            </div>
        </div>
    );
}

// ============================================================
//  ModelParamsButton — 根据 requestType 显示对应参数入口
// ============================================================

interface ModelParamsButtonProps {
    requestType: string;
}

export default function ModelParamsButton({ requestType }: ModelParamsButtonProps) {
    const { t } = useTranslation();
    const [showDialog, setShowDialog] = useState(false);

    // completions 类型不需要额外参数
    if (requestType === 'completions') return null;

    return (
        <>
            <ActionButton
                icon={"tune"}
                title={t("模型参数设置")}
                onClick={() => setShowDialog(true)}
            />

            {showDialog && (
                <>
                    <div className="overlay" onClick={() => setShowDialog(false)} />
                    {requestType === 'images' && (
                        <ImagesParamsDialog onClose={() => setShowDialog(false)} />
                    )}
                </>
            )}
        </>
    );
}
