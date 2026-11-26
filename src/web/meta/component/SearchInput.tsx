import React from "react";

/**
 * 通用搜索框：无图标，整行铺满。
 * AI 会话列表与 Studio 文件树共用，样式在 common.css 的 .search-input。
 */
export function SearchInput(props: {
    value: string;
    placeholder?: string;
    onChange?: (value: string) => void;
    className?: string;
}) {
    return <input
        type="text"
        className={`search-input ${props.className ?? ""}`}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange?.(e.target.value)}
    />;
}
