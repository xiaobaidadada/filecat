import React from 'react';
import {VideoPlayer} from "./VideoPlayer";
import {ActionButton} from "../../../../meta/component/Button";
import Header from "../../../../meta/component/Header";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {FileTypeEnum} from "../../../../../common/file.pojo";
import {ExtendedImage} from "./ExtendedImage";

export default function Preview(props: any) {
    const [file_preview, setFilePreview] = useRecoilState($stroe.file_preview);
    if (!file_preview.open) {
        return ;
    }
    function cancel () {
        setFilePreview({open:false})
    }
    let opt_div ;
    switch (file_preview.type) {
        case FileTypeEnum.video:
            opt_div = <VideoPlayer source={file_preview.url} options={{ autoplay: false }} />;
            break;
        case FileTypeEnum.image:
            opt_div = <ExtendedImage path={file_preview.url}/>
            break;
        case FileTypeEnum.pdf:
            opt_div = <object className={"pdf"} data={file_preview.url} type="application/pdf"></object>
            break;
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
            {opt_div}
        </div>
    </div>
    return file_preview.open && div;
}
