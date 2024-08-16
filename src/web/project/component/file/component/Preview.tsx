import React, {ReactNode, useEffect, useState} from 'react';
import {ExtendedImage} from "./ExtendedImage";
import {VideoPlayer} from "./VideoPlayer";
import {ActionButton} from "../../../../meta/component/Button";
import Header from "../../../../meta/component/Header";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";

export function Preview(props: any) {
    const [file_preview, setFilePreview] = useRecoilState($stroe.file_preview)
    function cancel () {
        setFilePreview({open:false})
    }
    const div = <div id={"previewer"}>
        <Header ignore_tags={true} left_children={[<ActionButton key={1} title={"取消"} icon={"close"} onClick={cancel}/>]}>
        </Header>
        {/*<div className="loading delayed" v-if="layoutStore.loading">*/}
        {/*    <div className="spinner">*/}
        {/*        <div className="bounce1"></div>*/}
        {/*        <div className="bounce2"></div>*/}
        {/*        <div className="bounce3"></div>*/}
        {/*    </div>*/}
        {/*</div>*/}
        <div className="preview">
            {/*<ExtendedImage />*/}
            <VideoPlayer source={file_preview.url} options={{ autoplay: false }} />
        </div>
    </div>
    return file_preview.open && div;
}
