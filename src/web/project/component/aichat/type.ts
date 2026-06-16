import {useTranslation} from "react-i18next";


export function use_llm_request_type () {
    const {t} = useTranslation();

    return [
        {value: "completions", label: t("文本对话")},
        {value: "images", label: t("图片生成")},
        // {value: "audio_speech", label: t("文本转语音")}, // todo 语音相关 api
        // {value: "audio_transcription", label: t("语音转文字")},
        {value: "embeddings", label: t("向量嵌入")},
    ]
}