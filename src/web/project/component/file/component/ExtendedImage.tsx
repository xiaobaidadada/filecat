import React, {ReactNode, useEffect, useRef, useState} from 'react';

// todo 图片查看暂时不要
export function ExtendedImage(props) {
    const container = useRef(null);
    const imgex = useRef(null);

    return <div className={"image-ex-container"} ref={container}>
        <img className="image-ex-img image-ex-img-center" ref={imgex}  />
    </div>
}
