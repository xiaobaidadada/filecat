import React from "react";
import EbookView from "./EbookView";

/** Studio 内嵌的电子书阅读：只渲染阅读区，外壳由 Studio 提供 */
export default function EbookInline(props: { url: string, name?: string }) {
    return (
        <div className={"ebook-inline"}>
            <EbookView url={props.url} name={props.name}/>
        </div>
    );
}
