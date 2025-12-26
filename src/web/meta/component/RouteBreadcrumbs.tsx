import React, {useState} from 'react';
import {Link, useLocation, useMatch, useNavigate} from "react-router-dom";
import {webPathJoin} from "../../../common/ListUtil";
import {getRouterPath} from "../../project/util/WebPath";
import {InputText} from "./Input";
import {DivOverlayTransparent, FileMenuItem, OverlayTransparent} from "./Dashboard";
// import '../resources/css/all.css'
// 依靠路由的面包屑

export function RouteBreadcrumbs(props: {
    baseRoute: string,
    clickFun?: (event?: any) => void,
    input_path_enter?:(path:string) => any,
}) {
    let location = useLocation();
    const [totalRoutePaths, setTotalRoutePaths] = useState([]);
    const [prePath, setPrePath] = useState('/');
    const [input_path, set_input_path] = useState(undefined);

    React.useEffect(() => {
        let prePathP = '';
        let routes = (getRouterPath()).split('/');
        routes = routes.filter(v => v)
        const indexp = routes.indexOf(props.baseRoute);
        const list: any[] = [];
        if (indexp != -1) {
            // for (let index = 0;index<indexp;index++) {
            //     prePathP+=routes[index];
            // }
            // console.log(prePathP)
            // console.log(props.baseRoute)
            // prePathP+=`/${props.baseRoute}/`;
            prePathP = webPathJoin(routes.slice(0, indexp), props.baseRoute)
            // console.log(webPathJoin(routes.slice(0,indexp),props.baseRoute));
            const routesp = routes.slice(indexp + 1);
            for (let index = 0; index < routesp.length; index++) {
                const v = routesp[index];

                list.push({
                    value: v,
                    href: index === 0 ? `${prePathP}${v}/` : webPathJoin(list[index - 1].href, v)
                })
            }

            setPrePath(prePathP)
            // console.log(JSON.stringify(list))
            setTotalRoutePaths(list);
        }
    }, [location]);
    const handleChevronClick = (event) => {
        event.stopPropagation(); // 阻止事件冒泡
        props.clickFun(event); // 调用父组件传递的点击处理函数
    };
    return <div className="breadcrumbs" onClick={(event) => {
        if(input_path !== undefined) {
            set_input_path(undefined)
        } else {
            set_input_path("")
        }
    }} >
        <React.Fragment >
            {input_path === undefined ?
                <React.Fragment>
                    <span className="chevron">
                <Link to={prePath} onClick={handleChevronClick}><i className="material-icons">home</i></Link>
            </span>
                    {
                        totalRoutePaths.map((value, index) => {
                            return (
                                <span className="chevron" key={index}>
                            <i className="material-icons">keyboard_arrow_right</i>
                            <Link to={value.href} onClick={handleChevronClick}>{decodeURIComponent(value.value)}</Link>
                    </span>)
                        })
                    }
                </React.Fragment>
                :
                <DivOverlayTransparent click={()=>{set_input_path(undefined)}}
                                    children={
                                        <InputText width={"100%"}
                                                   placeholder={"输入跳转的目录"}
                                                   handlerEnter={(v) => {
                                                       if(props.input_path_enter) {
                                                           props.input_path_enter(v);
                                                       }
                                                       set_input_path(undefined)
                                                   }}
                                        ></InputText>
                                    }/>

            }
        </React.Fragment>
    </div>
}
