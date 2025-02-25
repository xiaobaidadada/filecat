import React, {useEffect, useState} from 'react';
import {$stroe} from "../../../util/store";
import {useRecoilState} from "recoil";
import { FileMenuItem, Overlay, OverlayTransparent} from "../../../../meta/component/Dashboard";
import {CardPrompt, ProgressCard} from "../../../../meta/component/Card";
import {InputText} from "../../../../meta/component/Input";
import {NotyFail, NotySucess} from "../../../util/noty";
import {useTranslation} from "react-i18next";
import {sysHttp} from "../../../util/config";
import {RCode} from "../../../../../common/Result.pojo";
import {SysSoftware} from "../../../../../common/req/setting.req";

export function DiskMountAction(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [items, setItems,] = useState([{r:t("挂载"),v:t("挂载")}]);
    const [tarDir, setTarDir] = useState(undefined);
    const [is_opt, setIs_opt] = useState(true);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);

    const close = ()=>{
        setShowPrompt({show: false, type: '', overlay: false,data: {}});
    }
    const click = async (v)=> {
        setIs_opt(false);
    }
    const confirm = async ()=> {
        if(!tarDir) {
            NotyFail("挂载目录不能为空");
            return;
        }
        if (showPrompt.data.extra_data.mountpoints && showPrompt.data.extra_data.mountpoints.find(v=>v===tarDir)) {
            NotyFail("重复挂载");
            return;
        }
        if (!showPrompt.data.extra_data.path) {
            NotyFail("该设备块没有具体路径");
            return;
        }
        if (!showPrompt.data.extra_data.fstype) {
            NotyFail("该设备块没有文件系统");
            return;
        } else if (showPrompt.data.extra_data.fstype === "ntfs") {
            if (!user_base_info.sysSoftWare || !user_base_info.sysSoftWare[SysSoftware.ntfs_3g] || !user_base_info.sysSoftWare[SysSoftware.ntfs_3g].installed) {
                NotyFail(t("找不到ntfs-3g"))
                return;
            }
        } else if (showPrompt.data.extra_data.fstype !== "ext4" && showPrompt.data.extra_data.mountpoint) {
            NotyFail(t("非ext4格式，可能不支持多目录挂载"))
            return;
        }
        const rsq2 = await sysHttp.post("disk/mount",{
            fsType:showPrompt.data.extra_data.fstype , dir_path: tarDir, dev_path: showPrompt.data.extra_data.path
        });
        if (rsq2.code === RCode.Sucess) {
            if(showPrompt.data.call) {
                showPrompt.data.call();
            }
            close();
        }
    }
    if (!showPrompt.show) {
        return ;
    }
    return (<div>
        {is_opt ? <OverlayTransparent click={close} children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y} items={items} click={click}/>}/> :
        <div>
            <CardPrompt title={t("挂载设备")} cancel={close} confirm={confirm} cancel_t={t("取消")} confirm_t={t("确定")}
                        context={[
                            <InputText placeholder={t("输入挂载目录")} placeholderOut={t("目录")} value={tarDir} handleInputChange={(value) => setTarDir(value)}/>
                        ]}/>
            <Overlay click={close}/>
        </div>}
    </div>)
}
