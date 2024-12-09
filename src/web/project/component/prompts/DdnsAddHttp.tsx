import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {InputText, Select} from "../../../meta/component/Input";
import {ddnsHttp, fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {FileCompressType} from "../../../../common/file.pojo";
import {CardPrompt} from "../../../meta/component/Card";
import {NotySucess} from "../../util/noty";
import {DdnsIPPojo, ip_source_type} from "../../../../common/req/ddns.pojo";

export function DdnsAddHttp(props) {
    const { t } = useTranslation();
    const [format, setFormat] = useState("");

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [url, setUrl] = useState("");
    const [ip_formt, set_ip_formt] = useState("ipv4");
    const navigate = useNavigate();
    const location = useLocation();

    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{}})
    }
    const add = async ()=>{
        if (!url) {
            cancel()
            return;
        }
        const ipPojo = new DdnsIPPojo();
        ipPojo.isIPv4= ip_formt === "ipv4";
        ipPojo.ifaceOrWww=url;
        ipPojo.ip="";
        ipPojo.source_type = ip_source_type.http_get;
        const rsq = await ddnsHttp.post('http/add', ipPojo)
        if (rsq.code === 0) {
            NotySucess("添加成功，稍后刷新")
            navigate(location.pathname);
        }
        cancel();
    }

    return (<CardPrompt title={t("添加http获取ip")} cancel={cancel} confirm={add} confirm_enter={add} cancel_t={t("取消")}
                        confirm_t={t("添加")}
                        context={[
                            <Select value={ip_formt} onChange={(value) => {
                                set_ip_formt(value);
                            }} options={[{title: `ipv4`, value: 'ipv4'},{title: `ipv6`, value: 'ipv6'}]}/>,
                            <div className="card-content">
                                <InputText placeholderOut={t("输入http-get的url")} value={url}
                                           placeholder = "类如https://4.ipw.cn或者https://6.ipw.cn"
                                           handleInputChange={(value) => setUrl(value)}/>
                            </div>]}

    />)
}
