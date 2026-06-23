import React, {useState} from 'react'
import {InputTextIcon} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {netHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NavIndexContainer} from "../navindex/component/NavIndexContainer";
import {useTranslation} from "react-i18next";
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {NotyFail, NotySuccess} from "../../util/noty";


export function NetWol(props) {
    const { t } = useTranslation();
    const {check_user_auth} = use_auth_check();

    const [mac, setMac] = useState('');
    const go = async (macAddress?: string) => {
        const mac_v = macAddress?macAddress:mac;
        if (!mac_v) {
            NotyFail('mac地址不能为空')
            return;
        }
        const rsp = await netHttp.post("wol/exec", {mac:mac_v});
        if (rsp.code !== RCode.Success) {
            return;
        }
        NotySuccess('发送唤醒命令成功')
    }

    const getItems = async () => {
        const result = await netHttp.get("wol/tag");
        if (result.code === RCode.Success) {
            return result.data;
        }
        return [];
    }
    const saveItems = async (items) => {
        const rsq = await netHttp.post("wol/tag/save", items);
        if (rsq.code !== RCode.Success) {
            NotyFail('网络错误')
        }
    }
    const clickItem = async (item: any) => {
        setMac(item.mac);
        go(item.mac);
    }

    return <div>
        <Header>
            <ActionButton icon={"play_arrow"} title={t("发送")} onClick={()=>{go();}}/>
            <InputTextIcon placeholder={t("目标设备mac地址")} icon={"laptop_mac"} value={mac} handleInputChange={(v) => setMac(v)}/>
        </Header>

        <NavIndexContainer have_auth_edit={check_user_auth(UserAuth.wol_proxy_tag_update)} getItems={getItems} save={saveItems} clickItem={clickItem} items={[{key: "name", preName: t("名字")}, {key: "mac", preName: "mac"+t("地址")},{key:"color",preName:"color"}]}/>
    </div>
}
