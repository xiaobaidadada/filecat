import React, {useState} from 'react';
import {Link, useLocation, useMatch, useNavigate} from "react-router-dom";
import {webPathJoin} from "../../../common/ListUtil";
// import '../resources/css/all.css'
// 依靠路由的面包屑

export function RouteBreadcrumbs(props: {
    baseRoute: string,
    clickFun?:Function
}) {
    let location = useLocation();
    const [totalRoutePaths, setTotalRoutePaths] = useState([]);
    const [prePath, setPrePath] = useState('/');
    React.useEffect(() => {
        let prePathP = '';
        let routes = location.pathname.split('/');
        routes = routes.filter(v => v)
        const indexp = routes.indexOf(props.baseRoute);
        const list : any[] = [];
        if (indexp != -1) {
            // for (let index = 0;index<indexp;index++) {
            //     prePathP+=routes[index];
            // }
            // console.log(prePathP)
            // console.log(props.baseRoute)
            // prePathP+=`/${props.baseRoute}/`;
            prePathP = webPathJoin(routes.slice(0,indexp),props.baseRoute)
            // console.log(webPathJoin(routes.slice(0,indexp),props.baseRoute));
            const routesp = routes.slice(indexp + 1);
            for (let index = 0; index<routesp.length;index++) {
                const v = routesp[index];

                list.push({
                    value: v,
                    href: index===0?`${prePathP}${v}/`:webPathJoin(list[index-1].href,v)
                })
            }

            setPrePath(prePathP)
            // console.log(JSON.stringify(list))
            setTotalRoutePaths(list);
        }
    }, [location]);

    return <div className="breadcrumbs">
        <span>
            <span className="chevron">
                <Link to={prePath} onClick={props.clickFun}><i className="material-icons">home</i></Link>
            </span>
            {
                totalRoutePaths.map((value, index) => {
                    return (
                        <span className="chevron" key={index}>
                            <i className="material-icons">keyboard_arrow_right</i>
                            <Link to={value.href} onClick={props.clickFun}>{decodeURIComponent(value.value)}</Link>
                    </span>)
                })
            }
        </span>
    </div>
}
