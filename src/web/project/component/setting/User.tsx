import React, {useContext, useEffect, useRef, useState} from 'react'
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {Card, CardFull, StatusCircle, TextTip} from "../../../meta/component/Card";
import {ActionButton, ButtonText} from "../../../meta/component/Button";
import {Table} from "../../../meta/component/Table";
import {InputText, Select} from "../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {cryptoHttp, settingHttp, userHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {SysSoftware, TokenSettingReq} from "../../../../common/req/setting.req";
import {GlobalContext} from "../../GlobalProvider";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {NotyFail, NotySucess} from "../../util/noty";
import {UserAuth, UserData} from "../../../../common/req/user.req";
import {deleteList} from "../../../../common/ListUtil";
import {have_empty_char} from "../../../../common/StringUtil";
import {Permission} from "./component/Permission";

/**
 *  没有数据权限 所有数据用户都能看到（除了文件）
 *  只有接口权限
 */
const role_map = new Map<string,UserData>();
export function User() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const [rows, setRows] = useState([]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const [is_create,set_is_create] = useState(false);
    const [is_save,set_is_is_save] = useState(false);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [cwd, setwd] = useState("");
    const [access_dirs, set_access_dirs] = useState([]);
    const [not_access_dirs,set_not_access_dirs] = useState([]);
    const [only_read_dirs,set_only_read_dirs] = useState([]);
    const [access_cmd,set_access_cmd] = useState("");
    const [not_access_cmd,set_not_access_cmd] = useState("");
    const [language, setLanguage] = useState("en");
    const [auth_list,set_auth_list] = useState([]);
    const [note, set_note] = useState("");
    const [is_root, set_is_root] = useState(false);
    const [user_id, set_user_id] = useState("");
    const [bind_role_id, set_bind_role_id] = useState("");

    const [bind_role_item, set_bind_role_item] = useState({});

    const [roles,set_roles] = useState([]);

    const headers = [t("用户id"),t("用户名"),t("目录范围"), t("备注") ];


    const getItems = async () => {
        // 文件夹根路径
        const result = await userHttp.get("all_users");
        if (result.code === RCode.Sucess) {
            setRows(result.data);
        }

        const result2 = await userHttp.get("all_roles");
        if (result2.code === RCode.Sucess) {
            set_roles(result2.data);
            role_map.clear();
            for (const role of result2.data) {
                role_map.set(role.role_id,role);
            }
        }

    }

    const role_list_option = ()=>{
        const list = [];
        list.push({
            title: "NOT", value: ""
        })
        for (let item of roles) {
            list.push({
                title: item.role_name, value: item.role_id
            })
        }
        return list;
    }

    const set_show_values = (item)=>{
        setUsername(item?.username??"");
        setPassword(item?.password??"");
        setwd(item?.cwd??"");
        set_access_dirs(item?.access_dirs??[])
        set_not_access_dirs(item?.not_access_dirs??[])
        set_only_read_dirs(item?.only_read_dirs??[])
        set_access_cmd(item?.access_cmd??"");
        set_not_access_cmd(item?.not_access_cmd??"")
        setLanguage(item?.language??"");
        set_auth_list(item?.auth_list??[]);
        set_note(item?.note??"");
        set_is_root(item?.is_root??false);
        set_user_id(item?.id??"");
        if(item?.bind_role_id) {
            selete_role(item.bind_role_id,item.auth_list??[])
        } else {
            set_bind_role_id("");
            set_bind_role_item({});
        }

    }

    useEffect(() => {
        getItems();
        // set_show_values(user_base_info?.user_data)
    }, []);

    const selete_role = (role_id:string,auth_list=[]) => {
        if(!role_id) {
            set_bind_role_id("");
            set_bind_role_item({});
            return;
        }
        const role = role_map.get(role_id);
        if (role) {
            if(role.cwd)
                setwd(role.cwd);
            if(role.access_dirs && role.access_dirs.length>0)
                set_access_dirs(role.access_dirs)
            if(role.not_access_dirs && role.not_access_dirs.length >0)
                set_not_access_dirs(role.not_access_dirs)
            if(role.only_read_dirs && role.only_read_dirs.length>0)
                set_only_read_dirs(role.only_read_dirs)
            if(role.access_cmd)
                set_access_cmd(role.access_cmd);
            if(role.not_access_cmd)
                set_not_access_cmd(role.not_access_cmd);
            if(role.language)
                setLanguage(role.language);
            if(role.auth_list && role.auth_list.length > 0) {
                const set = new Set(role.auth_list);
                for (const key of auth_list) {
                    set.add(key);
                }
                set_auth_list(Array.from(set));
            }
            set_bind_role_id(role_id);
            set_bind_role_item(role);
            // console.log(role)
        }
    }

    const is_disable= (auth:UserAuth)=> {
        if(is_root === true) return true;
        if(bind_role_id) {
            const role = role_map.get(bind_role_id);
            if(role) {
                return (role.auth_list ?? []).includes(auth);
            }
        }
        return false;
    }

    const is_selected= (auth:UserAuth,not_root?:boolean)=> {
        if(!not_root && is_root === true) return true;
        return auth_list?.find(v => v === auth) !== undefined;
    }
    const select_auth = (auth:UserAuth)=>{
        if(auth_list) {
            if(auth_list.includes(auth)){
                deleteList(auth_list,(v)=>v===auth)
                set_auth_list([...auth_list]);
            } else {
                set_auth_list([...auth_list,auth]);
            }
        } else {
            set_auth_list([auth]);
        }
    }
    const create_user = ()=>{
        set_is_create(true);
        set_is_is_save(false)
        set_show_values(undefined)
    }
    const edit = (item)=>{
        set_is_create(false);
        set_is_is_save(true)
        set_show_values(item)
    }
    const get_user_value = ()=>{
        if(!username) {
            NotyFail('username not empty');
            return
        }
        if(have_empty_char(username)) {
            NotyFail('username not empty char');
            return
        }
        if(!cwd) {
            NotyFail('cwd not empty');
            return ;
        }
        const user_data = new UserData();
        user_data.language = language;
        user_data.access_dirs = access_dirs;
        user_data.username = username;
        user_data.password = password;
        user_data.not_access_dirs = not_access_dirs;
        user_data.only_read_dirs = only_read_dirs;
        user_data.cwd = cwd;
        user_data.note = note;
        user_data.access_cmd = access_cmd;
        user_data.not_access_cmd = not_access_cmd;
        user_data.auth_list = auth_list;
        user_data.bind_role_id = bind_role_id;
        return user_data;
    }
    const create_user_api = async ()=> {
        if(!password) {
            NotyFail('password not empty');
            return
        }
        if(have_empty_char(password)) {
            NotyFail('username not empty char');
            return
        }
        const user_data = get_user_value();
        const r =await userHttp.post("create_user", user_data);
        getItems();
        if(r.code === RCode.Sucess) {
            NotySucess("创建完成");
            getItems();
            set_is_create(false);
            set_is_is_save(false);
            set_show_values(undefined)
        }

    }
    const save_user_api = async ()=> {
        const user_data = get_user_value();
        if(!user_data) {
            return;
        }
        user_data.id = user_id;
        const r = await userHttp.post("save_user", user_data);
        if(r.code === RCode.Sucess) {
            NotySucess("保存完成");
            getItems();
        }
    }
    const delete_user_api = async (username)=> {
        setShowPrompt({
            open: true,
            title: "确定删除吗",
            // sub_title: ``,
            handle: async () => {
                const user_data = new UserData();
                user_data.username = username;
                const result = await userHttp.post("delete_user", user_data);
                if(result.code === RCode.Sucess) {
                    NotySucess("删除完成");
                    getItems();
                    setShowPrompt({open:false,handle:null});
                }
            }
        })

    }
    return (<Row>
        <Column widthPer={50}>
            <Dashboard>
                <CardFull self_title={<span className={" div-row "}><h2>{t("用户")}</h2>
                    {/*<ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/>*/}
                </span>}
                          titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={create_user}/></div>}>
                    <Table headers={headers} rows={rows.map((item, index) => {
                        const new_list = [
                            <p>{item.id}</p>,
                            <TextTip>{item.username}</TextTip>,
                            <TextTip>{item.cwd}</TextTip>,
                            <TextTip>{item.note}</TextTip>,
                            <div>
                                <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                                {!item.is_root && <ActionButton icon={"delete"} title={t("删除")} onClick={() => delete_user_api(item.username)}/>}
                            </div>,
                        ];
                        return new_list;
                    })} width={"10rem"}/>
                </CardFull>
            </Dashboard>

        </Column>
        <Column widthPer={50}>
            {
                (is_create || is_save) &&
                <Dashboard>
                    <Card self_title={<span
                        className={" div-row "}><h2>{t(`${is_create ? "添加" : "编辑"}`)}</h2> </span>}
                          rightBottomCom={<div>
                              <ActionButton icon={"cancel"} title={t("取消")} onClick={() => {
                                  set_is_create(false);
                                  set_is_is_save(false);
                                  set_show_values(undefined)
                              }}/>
                              {is_create &&
                                  <ActionButton icon={"add_circle"} title={t("添加")} onClick={create_user_api}/>}
                              {is_save && <ActionButton icon={"save"} title={t("保存")} onClick={save_user_api}/>}
                          </div>}>
                        <label>{t("用户名")}</label>
                        <InputText value={username} handleInputChange={(value) => setUsername(value)}/>
                        <label>{t("密码")}</label>
                        <InputText value={password} handleInputChange={(value) => setPassword(value)}/>

                        <label>
                            {!bind_role_item?.access_dirs?.length &&
                                <ActionButton icon={"add"} onClick={() => {
                                    set_access_dirs([...access_dirs, ""])
                                }} title={"添加"}/>
                            }
                            {t("目录范围")}</label>
                        <InputText disabled={bind_role_item.cwd!=="" && bind_role_item.cwd!==undefined} value={cwd} handleInputChange={(value) => setwd(value)}/>

                        {(access_dirs ?? []).map((item, index) => {
                            return <div key={index} style={{display: "flex",}}>
                                <div style={{width: "90%"}}>
                                    <InputText
                                        disabled={bind_role_item?.access_dirs?.length !== 0 && bind_role_item?.access_dirs?.length !== undefined}
                                        value={item} handleInputChange={(value) => {
                                        access_dirs[index] = value;
                                        set_access_dirs([...access_dirs]);
                                    }}/></div>
                                {bind_role_item?.access_dirs?.length === 0 || bind_role_item?.access_dirs?.length === undefined
                                    &&
                                    <ActionButton icon={"delete"} onClick={() => {
                                        access_dirs.splice(index, 1);
                                        set_access_dirs([...access_dirs]);
                                    }} title={t("删除")}/>
                                }

                            </div>
                        })}

                        <label>
                            {!bind_role_item?.not_access_dirs?.length &&
                                <ActionButton icon={"add"} onClick={() => {
                                    set_not_access_dirs([...not_access_dirs, ""])
                                }} title={t("添加")}/>
                            }
                            {t("禁止目录范围")}</label>
                        {(not_access_dirs ?? []).map((item, index) => {
                            return <div key={index} style={{display: "flex",}}>
                                <div style={{width: "90%"}}>
                                    <InputText
                                        disabled={bind_role_item?.not_access_dirs?.length !== 0 && bind_role_item?.not_access_dirs?.length!==undefined}
                                        value={item} handleInputChange={(value) => {
                                        not_access_dirs[index] = value;
                                        set_not_access_dirs([...not_access_dirs]);
                                    }}/></div>
                                {bind_role_item?.not_access_dirs?.length === 0 || bind_role_item?.not_access_dirs?.length ===undefined &&
                                    <ActionButton
                                        icon={"delete"} onClick={() => {
                                        not_access_dirs.splice(index, 1);
                                        set_not_access_dirs([...not_access_dirs]);
                                    }} title={t("删除")}/>
                                }
                            </div>
                        })}

                        <label>
                            {!bind_role_item?.only_read_dirs?.length &&
                                <ActionButton icon={"add"} onClick={() => {
                                    set_only_read_dirs([...only_read_dirs, ""])
                                }} title={t("添加")}/>
                            }
                            {t("只读目录范围")}</label>
                        {(only_read_dirs ?? []).map((item, index) => {
                            return <div key={index} style={{display: "flex",}}>
                                <div style={{width: "90%"}}>
                                    <InputText
                                        disabled={bind_role_item?.only_read_dirs?.length !== 0 && bind_role_item?.only_read_dirs?.length!==undefined}
                                        value={item} handleInputChange={(value) => {
                                        only_read_dirs[index] = value;
                                        set_only_read_dirs([...only_read_dirs]);
                                    }}/></div>
                                {bind_role_item?.only_read_dirs?.length === 0 || bind_role_item?.only_read_dirs?.length ===undefined &&
                                    <ActionButton
                                        icon={"delete"} onClick={() => {
                                        only_read_dirs.splice(index, 1);
                                        set_only_read_dirs([...only_read_dirs]);
                                    }} title={t("删除")}/>
                                }
                            </div>
                        })}

                        <label>{t("可执行的命令")}</label>
                        <InputText
                            disabled={bind_role_item.access_cmd !== "" && bind_role_item.access_cmd !== undefined}
                            value={access_cmd} placeholder={"use blank split"}
                            handleInputChange={(value) => set_access_cmd(value)}/>

                        <label>{t("禁止执行的命令")}</label>
                        <InputText
                            disabled={bind_role_item.not_access_cmd !== "" && bind_role_item.not_access_cmd !== undefined}
                            value={not_access_cmd} placeholder={"use blank split"}
                            handleInputChange={(value) => set_not_access_cmd(value)}/>

                        {
                            !is_root &&
                            <React.Fragment>
                                <label>{t("角色")}</label>
                                <Select value={bind_role_id} onChange={(value) => {
                                    selete_role(value);
                                }} options={role_list_option()}/>
                            </React.Fragment>
                        }


                        <label>{t("语言")}</label>
                        <Select
                            disabled={bind_role_item.language !== "" && bind_role_item.language !== undefined}
                            value={language} onChange={(value) => {
                            setLanguage(value);
                        }} options={[{title: "English", value: "en"}, {title: "中文", value: "zh"}]}/>

                        {/*<p className="small">{t("标签编辑是所有人都可见的的数据")}</p>*/}

                        <Permission is_disable={is_disable} is_selected={is_selected} select_auth={select_auth}/>
                        <label>{t("备注")}</label>
                        <InputText value={note} handleInputChange={(value) => set_note(value)}/>
                    </Card>
                </Dashboard>
            }
        </Column>
    </Row>)
}