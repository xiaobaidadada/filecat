import React from 'react';
import { useAtom } from 'jotai'; 
import {$stroe} from "../../../../util/store";



const Studio = React.lazy(() => import("./Studio"))

export default function StudioLazy() {
    // const [studio, set_studio] = useAtom($stroe.studio);
    //
    // if (!studio.folder_path) {
    //     return;
    // }
    return <React.Fragment>
        <Studio />
    </React.Fragment>
}