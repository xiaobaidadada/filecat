import React from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../../util/store";



const Studio = React.lazy(() => import("./Studio"))

export default function StudioLazy() {
    const [studio, set_studio] = useRecoilState($stroe.studio);

    if (!studio.folder_path) {
        return;
    }
    return <React.Fragment>
        <Studio />
    </React.Fragment>
}