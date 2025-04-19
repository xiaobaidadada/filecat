import React, {useEffect, useRef, useState} from 'react'
import {InputText, InputTextIcon, Select} from "../../../../meta/component/Input";
import {Card} from "../../../../meta/component/Card";
import {ActionButton, Button, ButtonLittle, ButtonText} from "../../../../meta/component/Button";
import {getRouterPath, isNumeric} from "../../../util/WebPath";
import Noty from "noty";
import Header from "../../../../meta/component/Header";
import {FullScreenDiv} from "../../../../meta/component/Dashboard";
import {netHttp, sshHttp} from "../../../util/config";
import {NetPojo} from "../../../../../common/req/net.pojo";
import {RCode} from "../../../../../common/Result.pojo";
import {Blank} from "../../../../meta/component/Blank";
import {NavIndexContainer} from "../../navindex/component/NavIndexContainer";
import {RemoteShell} from "../../shell/RemoteShell";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {RemoteLinuxFileList} from "./RemoteLinuxFileList";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {useTranslation} from "react-i18next";
import {use_auth_check} from "../../../util/store.util";
import {UserAuth} from "../../../../../common/req/user.req";
import {useNavigate} from "react-router-dom";
import {path_join} from "pty-shell/dist/path_util";



export function RemoteLinux(props) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    //连接信息
    const [username,setUsername] = useState('');
    const [password,setPassword] = useState('');
    const [private_path, setPrivatePath] = useState('');
    const [domain,setDomain] = useState('');
    const [port,setPort] = useState(undefined);
    const [dir,setDir] = useState('');
    // const [status,setStatus] = useState<boolean>(false);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);
    const [sshInfo,setSSHInfo] = useRecoilState<any>($stroe.sshInfo);
    const {check_user_auth} = use_auth_check();

    const close = async () => {
        const req = new SshPojo();
        req.key = sshInfo.key;
        // req.password = password;
        // req.domain = domain;
        // req.port = port;
        // req.username = username;
        const res = await sshHttp.post("close", req);
        // setStatus(false)
        setSSHInfo({})
    }
    const go = async (item?:SshPojo)=>{
        const req = new SshPojo();
        req.password = item?item.password:password;
        req.domain = item?item.domain:domain;
        req.port = item?item.port:port;
        req.username = item?item.username:username;
        req.private_path = item?item.private_path:private_path;
        const res = await sshHttp.post("start", req);
        if (res && res.code === RCode.Sucess) {
            req.dir = item?item.dir:dir;
            navigate(path_join('/toolbox/remoteShell', item.dir))
            setShellNowDir([req.dir]);
            setSSHInfo(res.data);
            // setStatus(true)
        }
    }
    const getItems = async ()=>{
        const result = await sshHttp.get("tag");
        if (result.code === RCode.Sucess) {
            return result.data;
        }
        return [];
    }
    const saveItems = async (items)=>{
        const rsq = await sshHttp.post("tag/save",items);
        if (rsq.code !== RCode.Sucess) {
            new Noty({
                type: 'error',
                text: '网络错误',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
    }
    const clickItem = async (item: SshPojo)=>{
        setDomain(item.domain);
        setDir(item.dir);
        setPort(item.port);
        setUsername(item.username);
        setPassword(item.password);
        setPrivatePath(item.private_path)
        await go(item);
    }
    const handlerSysPort = (v)=>{
        if (!v) {
            return;
        }
        const isNumber = /^\d+$/.test(v);
        if (!isNumber) {
            new Noty({
                type: 'error',
                text: '不是数字',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
        setPort(parseInt(v));
    }
    return <div>
        <Header>
            <InputTextIcon placeholder={t("目录")} icon={"home"} value={dir} handleInputChange={(v)=>setDir(v)} max_width={"15rem"}/>
            <InputTextIcon placeholder={t("账号")} icon={"verified_user"} value={username} handleInputChange={(v)=>setUsername(v)} max_width={"15rem"}/>
            <InputTextIcon placeholder={t("密码")} icon={"password"} value={password} handleInputChange={(v)=>setPassword(v)} max_width={"15rem"}/>
            <InputTextIcon placeholder={t("私钥路径")} icon={"private_connectivity"} value={private_path} handleInputChange={(v)=>setPrivatePath(v)} max_width={"15rem"}/>
            <InputTextIcon placeholder={t("连接地址")} icon={"location_on"} value={domain} handleInputChange={(v) => {setDomain(v);}} max_width={"15rem"}/>
            <InputTextIcon placeholder={t("端口")} icon={"outlet"} value={port} handleInputChange={handlerSysPort} max_width={"7rem"}/>
            <ActionButton icon={"play_arrow"} title={t("连接")} onClick={()=>{go()}}/>
        </Header>
        {!sshInfo.key ?

            <NavIndexContainer have_auth_edit={check_user_auth(UserAuth.ssh_proxy_tag_update)} getItems={getItems}  save={saveItems} clickItem={clickItem} items={[{key:"name",preName:t("名字")},{key:"domain",preName:t("地址")},{key:"port",preName:t("端口")},{key:"username",preName:t("账号")},{key:"password",preName:t("密码")},{key:"private_path",preName:t("私钥路径")},{key:"dir",preName:t("访问目录")},{key:"color",preName:"color"}]}/>

            : <RemoteLinuxFileList close={close} data={{port,password,username,domain,dir}}/>}
    </div>
}
