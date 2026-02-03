import React, {ReactNode} from 'react';
import SimpleRoutes from "./SimpleRoutes";
import {Nav, NavProps} from "./NavProps";
import {Main} from "./Main";
import {flatten} from "../../project/util/ListUitl";

export const CommonBody: React.FC<NavProps & {children: ReactNode[]}> = (props) => {
    const hidden_navList= props.hidden_navList && flatten(props.hidden_navList)
    return (<>
        {/*网页功能选择 | 不管什么位置都是位于左边*/}
        <Nav  nav_is_mobile={props.nav_is_mobile} navList={props.navList}/>
        {/*网页主要内容 | 不管什么位置都是位于右边*/}
        {/*{JSON.stringify(flatten(props.list).map(v=>v.rto+"*"))}*/}
        <Main>
            <SimpleRoutes rtos={flatten(props.navList).map(v=>v.rto+"*")}>
                {props.children.filter(v=>!!v)}
            </SimpleRoutes>
            {
               hidden_navList &&
                // 没有按钮的路由
                <SimpleRoutes rtos={hidden_navList.map(v=>v.rto+"*")}>
                    {hidden_navList.map(v=> <React.Fragment key={v.rto} >{v.component}</React.Fragment>)}
                </SimpleRoutes>
            }
        </Main>

    </>)
}
