import React, {ReactNode} from 'react';
import SimpleRoutes from "./SimpleRoutes";
import {Nav, NavProps} from "./NavProps";
import {Main} from "./Main";
import {flatten} from "../../project/util/ListUitl";

export const CommonBody: React.FC<NavProps & {children: ReactNode[]}> = (props) => {

    return (<>
        {/*网页功能选择 | 不管什么位置都是位于左边*/}
        <Nav  nav_is_mobile={props.nav_is_mobile} navList={props.navList}/>
        {/*网页主要内容 | 不管什么位置都是位于右边*/}
        {/*{JSON.stringify(flatten(props.list).map(v=>v.rto+"*"))}*/}
        <Main>
            <SimpleRoutes rtos={flatten(props.navList).map(v=>v.rto+"*")}>
                {props.children.filter(v=>!!v)}
            </SimpleRoutes>
        </Main>

    </>)
}
