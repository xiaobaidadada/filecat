import React from "react";
import {ExtendedImage} from "../ExtendedImage";

/** Studio 内嵌的图片查看：复用文件预览那套可缩放拖拽的图片组件 */
export default function ImageInline(props: { url: string }) {
    return (
        <div className={"image-inline"}>
            <ExtendedImage path={props.url}/>
        </div>
    );
}
