import React from 'react';
import {ShellProps} from "./Shell";


const Shell = React.lazy(() => import("./Shell"))

export default function ShellLazy(props: ShellProps) {

    return <React.Fragment>
        <Shell {...props} />
    </React.Fragment>
}