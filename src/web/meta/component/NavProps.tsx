import React, {ReactNode, useEffect} from 'react';
// import '../resources/css/all.css'
import {MaterialIcon} from "material-icons";
import {To} from "./To";
import {getRouterPath} from "../../project/util/WebPath";

export interface NavItem {
    icon: MaterialIcon,
    name: string,
    rto: string,
    clickFun?: Function,
    component?:ReactNode
}

export interface NavProps {
    navList: NavItem[][],
    nav_is_mobile: boolean,
}

export function Nav(props: NavProps) {
    const [selectedIndex, setSelectedIndex] = React.useState("");
    useEffect(() => {
        let have = true;
        const all_router = getRouterPath();
        for (let index = 0; index < props.navList.length; index++) {
            let ok = false;
            for (let i=0;i<props.navList[index].length;i++) {
                if (!props.navList[index][i]?.rto) {
                    continue;
                }
                let rto = props.navList[index][i].rto.replace("*","");
                if (all_router.includes(rto)  && rto!=="/") {
                    setSelectedIndex(`${index}_${i}`);
                    have = false;
                    ok = true;
                    break;
                }
            }
            if(ok)break;
        }
        if(have) {
            setSelectedIndex("0_0");
        }

    }, [props.navList]);
    return (
        <nav className={`${props.nav_is_mobile? "active" :""}  not-select-div`}>
            {props.navList.map((item, index) => {
                return (<div key={index} className=" nav_1" >
                    {item.map((item2, index2) => {
                        if (item2.component) return (
                            <div  key={index2}>
                                {item2.component}
                            </div>
                        );
                        return (
                            <To rto={item2.rto} key={index2} clickFun={item2.clickFun} className={` nav_2  ${selectedIndex === `${index}_${index2}` ? "nav_2_active" : ""}`}>
                                <i className="material-icons " style={{color:"#546e7a"}}>{item2.icon}</i>
                                <span className=" nav_3">{item2.name}</span>
                            </To>)
                    })}
                </div>)

            })}
        </nav>
    );
}
