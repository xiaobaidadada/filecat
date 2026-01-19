import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import React from "react";
import Md from "../file/component/markdown/Md";


export function using_tip() {
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    return (context:any)=>{
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    <Md context={context}/>
                </div>
            )})
    }
}