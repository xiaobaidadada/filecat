import React, {useEffect, useRef, useState} from 'react';
import {Link, useLocation, useMatch, useNavigate} from "react-router-dom";
import {webPathJoin} from "../../../common/ListUtil";
import {getRouterPath} from "../../project/util/WebPath";
import {InputText} from "./Input";
import {DivOverlayTransparent, MenuSelect, OverlayTransparent} from "./Dashboard";
import {useTranslation} from "react-i18next";
import {Icon} from "./Button";
// import '../resources/css/all.css'
// 依靠路由的面包屑

export function RouteBreadcrumbs(props: {
    baseRoute: string,
    clickFun?: (event?: any) => void,
    input_path_enter?:(path:string) => any,
}) {
    let location = useLocation();
    const navigate = useNavigate();
    const [totalRoutePaths, setTotalRoutePaths] = useState([]);
    const [prePath, setPrePath] = useState('/');
    const [input_path, set_input_path] = useState(undefined);
    const { t, i18n } = useTranslation();

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

    /*
     * 路径太长时折叠中间段：首页和尽可能多的尾部段位保留，其余收进 ... 里。
     * collapsed_count 表示中间折叠掉的段数，0 表示不折叠。
     */
    const [collapsed_count, set_collapsed_count] = useState(0);
    const box_ref = useRef<HTMLDivElement>(null);
    const items_ref = useRef<HTMLDivElement>(null);

    /*
     * 路径太长时折叠中间段：首页和尽可能多的尾部段位保留，其余收进 ... 里。
     * 宽度取自隐藏副本，副本与真实渲染结构一致，所以累加值即真实占宽。
     */
    const handleResize = () => {
        const box = box_ref.current;
        const items = items_ref.current;
        if (!box || !items) {
            return;
        }
        const widths: number[] = [];
        for (const child of Array.from(items.children)) {
            widths.push((child as HTMLElement).getBoundingClientRect().width);
        }
        const box_width = box.clientWidth;
        const total = widths.reduce((a, b) => a + b, 0);
        // widths[0] 是首页，其余是路径段
        if (total <= box_width || widths.length <= 2) {
            set_collapsed_count((pre) => (pre === 0 ? pre : 0));
            return;
        }
        // 尾部从后往前尽量多留，给首页和折叠按钮先预占位置
        const fold_dot_width = 48;
        let used = widths[0] + fold_dot_width;
        let keep = 0;
        for (let i = widths.length - 1; i >= 1; i--) {
            if (used + widths[i] > box_width) {
                break;
            }
            used += widths[i];
            keep++;
        }
        const next = Math.max(widths.length - 1 - keep, 0);
        set_collapsed_count((pre) => (pre === next ? pre : next));
    };

    useEffect(() => {
        handleResize();
        // 宽度变化不止来自窗口缩放：打开/收拢右侧面板也会改变这一行的可用宽度
        const observer = new ResizeObserver(handleResize);
        if (box_ref.current) {
            observer.observe(box_ref.current);
        }
        return () => observer.disconnect();
    }, [totalRoutePaths, prePath, location]);

    /*
     * 上面是按隐藏副本的段宽估算的，真实渲染会带上图标间距等额外开销，
     * 渲染完成后以实际是否溢出来复核，仍超宽就再折叠一段。
     */
    useEffect(() => {
        const box = box_ref.current;
        if (!box || collapsed_count === 0) {
            return;
        }
        if (box.scrollWidth > box.clientWidth && collapsed_count < totalRoutePaths.length - 1) {
            set_collapsed_count((pre) => pre + 1);
        }
    });

    // 折叠区间：从第 2 段开始，连续 collapsed_count 段收进 ...，尾部保留的段位由宽度计算决定
    const fold_start = 1;
    const fold_end = collapsed_count > 0 ? fold_start + collapsed_count : fold_start;
    const hidden_items = collapsed_count > 0 ? totalRoutePaths.slice(fold_start, fold_end) : [];

    // 折叠下拉：点 ... 弹出项目统一的 MenuSelect（自带边界修正）
    const [fold_menu, set_fold_menu] = useState<{ x: number, y: number } | null>(null);

    // 折叠段位变化后菜单里的内容就变了，直接关掉避免显示旧数据
    useEffect(() => {
        set_fold_menu(null);
    }, [location, collapsed_count]);

    return <div className="breadcrumbs" ref={box_ref} onClick={(event) => {
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
                <Link to={prePath} onClick={handleChevronClick}><Icon icon={'home'}/></Link>
            </span>
                    {
                        totalRoutePaths.map((value, index) => {
                            // 折叠区间内的段位不渲染，只在一个位置放 ... 收起按钮
                            const is_folded = collapsed_count > 0 && index >= fold_start && index < fold_end;
                            if (is_folded) {
                                if (index !== fold_start) {
                                    return null;
                                }
                                return (
                                    <span className="chevron" key={"fold"}>
                                        <Icon icon={'keyboard_arrow_right'} />
                                        <span className="breadcrumbs-fold-dot"
                                              onClick={(event) => {
                                                  event.stopPropagation();
                                                  const rect = event.currentTarget.getBoundingClientRect();
                                                  // 菜单从 ... 左下方弹出，MenuSelect 会自行做边界修正
                                                  set_fold_menu({x: rect.left, y: rect.bottom});
                                              }}>...</span>
                                    </span>
                                );
                            }
                            return (
                                <span className="chevron" key={index}>
                            <Icon icon={'keyboard_arrow_right'} />
                            <Link to={value.href} onClick={handleChevronClick}>{decodeURIComponent(value.value)}</Link>
                    </span>)
                        })
                    }
                    {/* 量宽度用的隐藏副本，结构和真实渲染保持一致，否则量出来的宽度不准 */}
                    <div className="breadcrumbs-measure" ref={items_ref} aria-hidden={true}>
                        <span className="chevron">
                            <Link to={prePath}><Icon icon={'home'}/></Link>
                        </span>
                        {totalRoutePaths.map((value, index) => (
                            <span className="chevron" key={index}>
                                <Icon icon={'keyboard_arrow_right'} />
                                <Link to={value.href}>{decodeURIComponent(value.value)}</Link>
                            </span>
                        ))}
                    </div>
                </React.Fragment>
                :
                <DivOverlayTransparent click={()=>{set_input_path(undefined)}}
                                    children={
                                        <InputText width={"100%"}
                                                   placeholder={t("输入跳转的目录")}
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
        {/* 被折叠的中间层级，点 ... 后用项目统一的 MenuSelect 列出 */}
        {fold_menu && (
            <OverlayTransparent click={() => set_fold_menu(null)}>
                <MenuSelect x={fold_menu.x} y={fold_menu.y}
                            items={hidden_items.map((hidden) => ({
                                r: decodeURIComponent(hidden.value),
                                v: hidden.href,
                            }))}
                            click={(v) => {
                                set_fold_menu(null);
                                navigate(v);
                            }}/>
            </OverlayTransparent>
        )}
    </div>
}
