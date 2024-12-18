import React, {useEffect, useRef, useState} from 'react'
import {Terminal} from '@xterm/xterm';

import {CmdType, WsData} from "../../../../../common/frame/WsData";
import {ws} from "../../../util/ws";
import {SysPojo} from "../../../../../common/req/sys.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {Shell} from "../../shell/Shell";
import {ShellInitPojo} from "../../../../../common/req/ssh.pojo";
import Header from "../../../../meta/component/Header";
import {ActionButton} from "../../../../meta/component/Button";
import {SearchAddon} from '@xterm/addon-search';
import {FileCompressPojo, LogViewerPojo} from "../../../../../common/file.pojo";
import {getRouterAfter} from "../../../util/WebPath";
import {NotyWaring} from "../../../util/noty";
import {InputTextIcon} from "../../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {deleteList} from "../../../../../common/ListUtil";
// const insert_data = (data:string)=> {
//     if(!data)return;
//     insert_done = false;
//     const list = data.split("\n");
//     if (context_list.length >= history_max_line) {
//         // dom 数量早就超过了 100
//         context_list.push(...list);
//         context_list.splice(0, context_list.length - history_max_line); // 删除多余的元素
//         // 全部重新渲染
//         for (let i=0; i < context_list.length; i++) {
//             shellRef.current.children[i].textContent = context_list[i];
//         }
//     } else {
//         // dom 元素不足 100个
//         const totalLength = list.length + context_list.length;
//         if (totalLength  > history_max_line) {
//             // dom 数量不够100 但是加上就超过 100了
//             context_list.push(...list);
//             context_list.splice(0, totalLength - history_max_line); // 删除前面多余的元素
//             // 前面的先重新渲染
//             for (let i=0; i < shellRef.current.children.length; i++) {
//                 if (shellRef.current.children[i].textContent)
//                     shellRef.current.children[i].textContent = context_list[i];
//             }
//             if (shellRef.current.children.length < history_max_line) {
//                 // 后面的还没够100个dom补足一下
//                 for (let i = shellRef.current.children.length; i< context_list.length; i++) {
//                     insert(context_list[i])
//                 }
//             }
//         }  else {
//             // 元素数量加上也不够 100 直接新建 前面的不用渲染
//             for (const item of list) {
//                 insert(item)
//                 context_list.push(item);
//             }
//         }
//     }
//
// }

const history_max_line = 300; // 最多创建多少个dom对象


// todo dom元素铺满的时候 走dom的值覆盖 而不是插入新的dom对象

// let insert_num = 0; // 插入次数

let last_position = 0;

let alert = false;
var req :LogViewerPojo;

var dom_children_list = [];

export default function LogViewer(props) {
    const [shellShow, setShellShow] = useRecoilState($stroe.log_viewer);
    const shellRef = useRef(null);
    const [progress,set_progress ] = useState(0);
    const [go_progress,set_go_progress ] = useState(0);
    const { t } = useTranslation();

    const insert_dom = (data,position:number,start_postion:number,back = false,firstChild?:any)=> {
        // insert_num++;
        const update = shellRef.current.scrollTop === shellRef.current.scrollHeight
        const newDiv = document.createElement('div');
        newDiv.textContent = data;
        newDiv.style.whiteSpace = 'break-word';
        newDiv.style.overflowWrap = 'break-word';
        newDiv.setAttribute('position',`${position}`);
        newDiv.setAttribute('start_position',`${start_postion}`);
        if (back) {
            shellRef.current.insertBefore(newDiv, firstChild);
            dom_children_list.unshift(newDiv);
        } else {
            shellRef.current.appendChild(newDiv);
            dom_children_list.push(newDiv);
        }
        if (update)
        shellRef.current.scrollTop = shellRef.current.scrollHeight;
        return newDiv;
    }

    const delete_dom = (dom)=>{
        const v = deleteList(dom_children_list,(v)=>v===dom);
        // console.log(v)
        if (v)shellRef.current.removeChild(v);
    }

    const insert_v2 = (data:string|string[],position_list:number[],start_position_list:number[],back:boolean = false) => {
        if(!data)return;
        const list = Array.isArray(data)?data:data.split("\n");
        if (!back) {
            // 正向插入
            for (let i=0; i < list.length; i++) {
                insert_dom(list[i],position_list[i],start_position_list[i]);
            }
            if (dom_children_list.length > history_max_line) {
                for (let i = 0; i < dom_children_list.length-history_max_line ; i++) {
                    delete_dom(dom_children_list[i]);
                }
            }
        } else {
            // 逆向插入
            let last_div;
            for (let i=0; i < list.length; i++) {
                last_div = insert_dom(list[i],position_list[i] ,start_position_list[i],true,i  === 0?shellRef.current.firstChild :last_div  );
            }
            if (dom_children_list.length > history_max_line) {
                for (let i = dom_children_list.length-1; i >= history_max_line ; i--) {
                    delete_dom(dom_children_list[i]);
                }
            }
        }
    }

    const send = async ()=>{
        req.context = '';
        const data = await ws.sendData(CmdType.log_viewer, req) ;
        if (data) {
            const pojo = data.context as LogViewerPojo;
            req = pojo;
            // console.log(req)
            insert_v2(pojo.context_list,pojo.context_position_list,pojo.context_start_position_list,req.back);
            if(req.back) {
                set_progress(Math.floor(100 * parseInt(shellRef.current.children[shellRef.current.children.length - req.context_list.length -1].getAttribute('position')) / req.max_size))
            } else {
                set_progress(Math.floor(100 * (req.context_position_list[req.context_position_list.length-1] ??0) / req.max_size))
            }
        }
    }
    const initTerminal = async () => {

        // 监听滚动事件
        const handleScroll = async () => {
            // if (insert_num > 0) {
            //     console.log(insert_num)
            //     insert_num --;
            //     // return;
            // }
            const element = shellRef.current;
            if (element) {
                // 检测是否滚动到底部
                if (last_position < element.scrollTop  && dom_children_list.length > 0&& element.scrollTop + element.clientHeight + 500  >= element.scrollHeight) {
                    // console.log("滚动到达底部");
                    const position = parseInt(dom_children_list[dom_children_list.length -1].getAttribute('position'))
                    if (position >= req.max_size)  {
                        if (!alert) {
                            alert = true;
                            NotyWaring('到达底部');
                        }
                        // console.log(position,req.max_size)
                        last_position = element.scrollTop;
                        return;
                    }
                    req.line = 20;
                    req.context = "";
                    req.context_list = [];
                    req.context_position_list = [];
                    req.context_start_position_list = [];
                    req.back = false;
                    req.position = position
                    await send();
                    // insert_v2("好",[parseInt(shellRef.current.children[shellRef.current.children.length -1].getAttribute('position'))]);
                }
                // 检测是否滚动到顶部
                else if (last_position > element.scrollTop  && dom_children_list.length > 0&& element.scrollTop - 300  <= 0) {
                    // console.log("滚动到达顶部");
                    const position = parseInt(dom_children_list[0].getAttribute('start_position'));
                    if (position <= 0)  {
                        if (!alert) {
                            alert = true;
                            NotyWaring('到达顶部');
                        }
                        last_position = element.scrollTop;
                        return;
                    }
                    req.line = 10;
                    req.context = "";
                    req.context_list = [];
                    req.context_position_list = [];
                    req.context_start_position_list = [];
                    req.back = true;
                    req.position = position
                    await send();
                    // insert_v2("好",[parseInt(shellRef.current.children[0].getAttribute('position'))],true);
                }
                last_position = element.scrollTop;
                alert = false;
            }
        };
        shellRef.current.addEventListener("scroll", handleScroll);
        const handleWheel = (e: WheelEvent) => {
            const element = shellRef.current;
            if (element) {
                // 阻止默认滚动行为
                e.preventDefault();
                // 获取一行的高度
                const lineHeight = 20; // 你可以根据实际内容设置
                const scrollAmount = lineHeight;
                // 根据滚轮滚动的方向来滚动
                if (e.deltaY > 0) {
                    element.scrollTop += scrollAmount; // 向下滚动一行
                } else {
                    element.scrollTop -= scrollAmount; // 向上滚动一行
                }
            }
        };
        shellRef.current.addEventListener("wheel", handleWheel, { passive: false });

        set_go_progress(0)
        last_position = 0;
        dom_children_list = [];
        req = new LogViewerPojo();


        req.line = history_max_line;
        req.path = `${getRouterAfter('file', location.pathname)}${shellShow.fileName}`;
        req.token = localStorage.getItem("token");

        await send();
    }


    const close = () => {
        if (shellRef.current) {
            // shellRef.current.removeEventListener("scroll", handleScroll);
            shellRef.current.remove();
        }
        dom_children_list = [];
    }
    useEffect(() => {
        if (!shellShow.show) {
            close();
            return
        }
        initTerminal();
    }, [shellShow])
    useEffect(() => {
        return () => {
            close();
        }
    }, []);

    if (!shellShow.show) {
        return;
    }
    const go_to_progress = async ()=>{
        for (const item of dom_children_list) {
            shellRef.current.removeChild(item);
        }
        dom_children_list = [];
        req.line = history_max_line;
        req.context = "";
        req.context_list = [];
        req.context_position_list = [];
        req.context_start_position_list = [];
        req.back = false;
        req.position = Math.floor(req.max_size * (parseInt(go_progress) / 100));
        await send();
    }
    return <div id={'editor-container'}>
        <Header ignore_tags={true} left_children={[<ActionButton key={1} title={"取消"} icon={"close"} onClick={() => {
            setShellShow({show: false})
        }}/>]}>
            加载进度{progress}<InputTextIcon max_width={"10rem"} placeholder={t('跳转进度')} icon={"percent"} value={go_progress} handleInputChange={(v) => {
                set_go_progress(v);
            }}/>
            <ActionButton icon={"play_arrow"} title={t("跳转进度")} onClick={go_to_progress}/>
        </Header>
        <div style={{height: `100%`}}>
            <div ref={shellRef} style={{
                overflowY: 'auto',
                height: '100%'
            }}>
            </div>
        </div>
    </div>
}
