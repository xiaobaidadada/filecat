import React, {ReactNode, useEffect, useRef, useState} from 'react';


export function ExtendedImage(props:{path:string}) {
    const container = useRef(null);
    const imgex = useRef(null);

    return <div className={"image-ex-container"} ref={container} style={{height:'100%'}} >
        <img className="image-ex-img image-ex-img-center" ref={imgex} src={props.path} alt={""} />
    </div>
}
