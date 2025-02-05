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


export function Role() {
    const { t, i18n } = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);
    const [rows, setRows] = useState([]);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const [is_create,set_is_create] = useState(false);
    const [is_save,set_is_is_save] = useState(false);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);

    const [role_name, set_role_name] = useState("");
    const [cwd, setwd] = useState("");
    const [access_dirs, set_access_dirs] = useState([]);
    const [not_access_dirs,set_not_access_dirs] = useState([]);
    const [only_read_dirs,set_only_read_dirs] = useState([]);
    const [access_cmd,set_access_cmd] = useState("");
    const [language, setLanguage] = useState("");
    const [auth_list,set_auth_list] = useState([]);
    const [role_id, set_role_id] = useState("");
    const [role_note, set_role_note] = useState("");

    const headers = [t("角色id"),t("角色名"), t("备注") ];


    const getItems = async () => {
        // 文件夹根路径
        const result = await userHttp.get("all_roles");
        if (result.code === RCode.Sucess) {
            setRows(result.data);
        }

    }
    const set_show_values = (item)=>{
        set_role_name(item?.role_name??"");
        setwd(item?.cwd??"");
        set_access_dirs(item?.access_dirs??[])
        set_not_access_dirs(item?.not_access_dirs??[])
        set_only_read_dirs(item?.only_read_dirs??[])
        set_access_cmd(item?.access_cmd??"");
        setLanguage(item?.language??"");
        set_auth_list(item?.auth_list??[]);
        set_role_id(item?.role_id??"");
        set_role_note(item?.role_note??"");
    }

    useEffect(() => {
        getItems();
        // set_show_values(user_base_info?.user_data)
    }, []);


    const is_selected= (auth:UserAuth,not_root?:boolean)=> {
        return auth_list?.find(v => v === auth) !== undefined;
    }
    const select_auth = (auth:UserAuth)=>{
        if(auth_list) {
            if(auth_list.find(v=>v==auth)){
                deleteList(auth_list,(v)=>v===auth)
            } else {
                auth_list.push(auth);
            }
            set_auth_list([...auth_list]);
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
        if(!role_name) {
            NotyFail('role_name not empty');
            return
        }
        const user_data = new UserData();
        user_data.language = language;
        user_data.access_dirs = access_dirs;
        user_data.role_name = role_name;
        user_data.not_access_dirs = not_access_dirs;
        user_data.only_read_dirs = only_read_dirs;
        user_data.cwd = cwd;
        user_data.access_cmd = access_cmd;
        user_data.auth_list = auth_list;
        user_data.role_note = role_note;
        return user_data;
    }
    const create_user_api = async ()=> {
        const user_data = get_user_value();
        if(!user_data) return ;
        const r =await userHttp.post("create_role", user_data);
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
        if(!user_data) return ;
        user_data.role_id = role_id;
        const r = await userHttp.post("save_role", user_data);
        if(r.code === RCode.Sucess) {
            NotySucess("保存完成");
            getItems();
        }
    }
    const delete_user_api = async (role_id)=> {
        setShowPrompt({
            open: true,
            title: "确定删除吗",
            // sub_title: ``,
            handle: async () => {
                const user_data = new UserData();
                user_data.role_id = role_id;
                const result = await userHttp.post("delete_role", user_data);
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
                <CardFull self_title={<span className={" div-row "}><h2>{t("角色")}</h2>
                    {/*<ActionButton icon={"info"} onClick={()=>{soft_ware_info_click()}} title={"信息"}/>*/}
                </span>}
                          titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={create_user}/></div>}>
                    <Table headers={headers} rows={rows.map((item, index) => {
                        const new_list = [
                            <p>{item.role_id}</p>,
                            <TextTip>{item.role_name}</TextTip>,
                            <TextTip>{item.role_note}</TextTip>,
                            <div>
                                <ActionButton icon={"edit"} title={t("编辑")} onClick={() => edit(item)}/>
                                {!item.is_root && <ActionButton icon={"delete"} title={t("删除")} onClick={() => delete_user_api(item.role_id)}/>}
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
                        <label>角色名</label>
                        <InputText value={role_name} handleInputChange={(value) => set_role_name(value)}/>
                        <label>角色备注</label>
                        <InputText value={role_note} handleInputChange={(value) => set_role_note(value)}/>

                        <label><ActionButton icon={"add"} onClick={() => {
                            set_access_dirs([...access_dirs, ""])
                        }} title={"添加"}/>目录范围</label>
                        <InputText value={cwd} handleInputChange={(value) => setwd(value)}/>
                        {(access_dirs ?? []).map((item, index) => {
                            return <div key={index} style={{display: "flex",}}>
                                <div style={{width: "90%"}}><InputText value={item} handleInputChange={(value) => {
                                    access_dirs[index] = value;
                                    set_access_dirs([...access_dirs]);
                                }}/></div>
                                <ActionButton icon={"delete"} onClick={() => {
                                    access_dirs.splice(index, 1);
                                    set_access_dirs([...access_dirs]);
                                }} title={"删除"}/>
                            </div>
                        })}

                        <label><ActionButton icon={"add"} onClick={() => {
                            set_not_access_dirs([...not_access_dirs, ""])
                        }} title={"添加"}/>禁止目录范围</label>
                        {(not_access_dirs ?? []).map((item, index) => {
                            return <div key={index} style={{display: "flex",}}>
                                <div style={{width: "90%"}}><InputText value={item} handleInputChange={(value) => {
                                    not_access_dirs[index] = value;
                                    set_not_access_dirs([...not_access_dirs]);
                                }}/></div>
                                <ActionButton icon={"delete"} onClick={() => {
                                    not_access_dirs.splice(index, 1);
                                    set_not_access_dirs([...not_access_dirs]);
                                }} title={"删除"}/>
                            </div>
                        })}

                        <label><ActionButton icon={"add"} onClick={() => {
                            set_only_read_dirs([...only_read_dirs, ""])
                        }} title={"添加"}/>只读目录范围</label>
                        {(only_read_dirs ?? []).map((item, index) => {
                            return <div key={index} style={{display: "flex",}}>
                                <div style={{width: "90%"}}><InputText value={item} handleInputChange={(value) => {
                                    only_read_dirs[index] = value;
                                    set_only_read_dirs([...only_read_dirs]);
                                }}/></div>
                                <ActionButton icon={"delete"} onClick={() => {
                                    only_read_dirs.splice(index, 1);
                                    set_only_read_dirs([...only_read_dirs]);
                                }} title={"删除"}/>
                            </div>
                        })}

                        <label>可执行的命令</label>
                        <InputText value={access_cmd} placeholder={"use blank split"}
                                   handleInputChange={(value) => set_access_cmd(value)}/>
                        <label>语言</label>
                        <Select value={language} onChange={(value) => {
                            setLanguage(value);
                        }} options={[{title: "NOT", value: ""},{title: "English", value: "en"}, {title: "中文", value: "zh"}]}/>
                        <p className="small">标签编辑是所有人都可见的的数据</p>

                        <Permission is_disable={() => {
                            return false
                        }} is_selected={is_selected} select_auth={select_auth}/>

                    </Card>
                </Dashboard>
            }
        </Column>

    </Row>)
}