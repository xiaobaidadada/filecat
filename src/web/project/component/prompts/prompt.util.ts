import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";


// 二次确认
export function using_confirm() {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);

    return ({
                sub_title,
                confirm_fun,
                title,
            }: {
        sub_title: string,
        confirm_fun: () => any,
        title?: string,
    }) => {
        setShowPrompt({
            open: true,
            sub_title,
            handle: ()=>{
                confirm_fun()
                setShowPrompt({open:false,handle:null})
            },
            title
        })
    }
}