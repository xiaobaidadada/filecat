import React, {useState, useEffect} from 'react';
import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {MenuSelect} from "../../prompts/Prompt";
import {ActionButton} from "../../../../meta/component/Button";
import {InputText} from "../../../../meta/component/Input";
import {use_llm_request_type} from "../type";



/**
 * 从 localStorage 读取图片生成额外参数
 */
function getImagesExtraParams(): Record<string, any> {
    try {
        const saved = localStorage.getItem("ai_images_extra_params");
        if (saved) return JSON.parse(saved);
    } catch {}
    return { size: "1024x1024", n: 1 };
}

/**
 * 保存图片生成额外参数到 localStorage
 */
function saveImagesExtraParams(params: Record<string, any>) {
    localStorage.setItem("ai_images_extra_params", JSON.stringify(params));
}

/**
 * 图片参数设置弹窗组件
 */
function ImagesParamsDialog({onClose}: { onClose: () => void }) {
    const {t} = useTranslation();
    const [params, setParams] = useState(getImagesExtraParams);
    const [size, setSize] = useState(params.size || "1024x1024");
    const [n, setN] = useState(String(params.n ?? 1));
    const [quality, setQuality] = useState(params.quality || "");
    const [style, setStyle] = useState(params.style || "");
    const [extraJson, setExtraJson] = useState(params.extra_json || "");

    const handleSave = () => {
        const newParams: Record<string, any> = {
            size,
            n: parseInt(n) || 1,
        };
        if (quality) newParams.quality = quality;
        if (style) newParams.style = style;
        if (extraJson) newParams.extra_json = extraJson;
        saveImagesExtraParams(newParams);
        onClose();
    };

    return (
        <div className="card" style={{padding: "1rem", minWidth: "320px"}}>
            <h3>{t("图片生成参数设置")}</h3>
            <p style={{fontSize: "0.85em", color: "var(--textSecondary)", marginBottom: "0.75rem"}}>
                不同模型支持的参数不同，请参考模型文档。常见 size 值: 1024x1024, 1792x1024, 1024x1792 (DALL-E 3)
            </p>
            <div style={{display: "flex", flexDirection: "column", gap: "0.75rem"}}>
                <div>
                    <label>size (图片尺寸)</label>
                    <InputText value={size} handleInputChange={setSize} no_border={false}/>
                </div>
                <div>
                    <label>n (生成数量)</label>
                    <InputText value={n} handleInputChange={setN} no_border={false}/>
                </div>
                <div>
                    <label>quality (画质, 如 "standard" / "hd")</label>
                    <InputText value={quality} handleInputChange={setQuality} no_border={false}/>
                </div>
                <div>
                    <label>style (风格, 如 "vivid" / "natural")</label>
                    <InputText value={style} handleInputChange={setStyle} no_border={false}/>
                </div>
                <div>
                    <label>额外参数 (JSON，会合并到请求体中)</label>
                    <InputText value={extraJson} handleInputChange={setExtraJson} no_border={false}/>
                </div>
            </div>
            <div style={{display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "flex-end"}}>
                <ActionButton icon={"close"} title={t("取消")} onClick={onClose}/>
                <ActionButton icon={"save"} title={t("保存")} onClick={handleSave}/>
            </div>
        </div>
    );
}

/**
 * 请求类型选择器
 * 选择当前聊天页面使用的请求类型，使用 useRecoilState 持久化
 * 使用 MenuSelect 组件实现下拉菜单
 */
export default function RequestTypeSelector() {
    const {t} = useTranslation();
    const [requestType, setRequestType] = useRecoilState($stroe.ai_request_type);
    const [showImagesParams, setShowImagesParams] = useState(false);
    const REQUEST_TYPE_OPTIONS = use_llm_request_type()

    const currentOption = REQUEST_TYPE_OPTIONS.find(opt => opt.value === requestType)
        ?? REQUEST_TYPE_OPTIONS[0];

    return (
        <>
            <MenuSelect
                list={[
                    ...REQUEST_TYPE_OPTIONS.map(opt => ({
                        name: opt.label,
                        click: () => setRequestType(opt.value)
                    })),
                    // 当选择图片生成类型时，显示参数设置入口
                    ...(requestType === 'images' ? [{
                        name:  t("图片参数设置"),
                        click: () => setShowImagesParams(true)
                    }] : []),
                    ...(requestType === 'audio_speech' ? [{
                        name:  t("语音参数设置"),
                        click: () => {
                            const saved = localStorage.getItem("ai_audio_extra_params");
                            const p = saved ? JSON.parse(saved) : {};
                            const voice = p.voice || "alloy";
                            const speed = p.speed || "1.0";
                            const newVoice = prompt(t("输入 voice (如 alloy, echo, fable, onyx, nova, shimmer)"), voice);
                            if (newVoice !== null) {
                                const newSpeed = prompt(t("输入 speed (0.25 ~ 4.0)"), speed);
                                if (newSpeed !== null) {
                                    localStorage.setItem("ai_audio_extra_params", JSON.stringify({
                                        voice: newVoice,
                                        speed: parseFloat(newSpeed) || 1.0
                                    }));
                                }
                            }
                        }
                    }] : []),
                ]}
            >
                <div className="menu-select-trigger" style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    whiteSpace: "nowrap",
                }}>
                    <span>{currentOption.label}</span>
                    <span style={{fontSize: "0.7em", opacity: 0.6}}>▾</span>
                </div>
            </MenuSelect>

            {showImagesParams && (
                <div className="modal-overlay" style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.4)", zIndex: 1000,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }} onClick={() => setShowImagesParams(false)}>
                    <div onClick={e => e.stopPropagation()}>
                        <ImagesParamsDialog onClose={() => setShowImagesParams(false)}/>
                    </div>
                </div>
            )}
        </>
    );
}
