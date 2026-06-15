import {useTranslation} from "react-i18next";


export const use_select_config = () =>{
    const {t} = useTranslation();


    return  [
        {title:t("是"),value:true,color: '#28a745'},
        {title:t("否"),value:false,color: '#666666'}
    ]
}