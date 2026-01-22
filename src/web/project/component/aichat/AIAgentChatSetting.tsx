import {useTranslation} from "react-i18next";
import React, {useContext, useEffect, useState} from "react";
import {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Column, FullScreenContext, FullScreenDiv} from "../../../meta/component/Dashboard";
import {Table} from "../../../meta/component/Table";
import {InputText, Select} from "../../../meta/component/Input";
import {CardFull} from "../../../meta/component/Card";
import {using_tip} from "../prompts/prompts.util";
import {settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySucess} from "../../util/noty";
import {GlobalContext} from "../../GlobalProvider";
import {editor_data, use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {ai_agent_Item} from "../../../../common/req/setting.req";


const tip_text = `
1. 只能使用符合openai风格的ai接口
2. 对话的历史越长，消耗的大模型token费用越贵，目前不具备长期记忆简化能力
3. model请求参数json编写，里面只能编写json,来用于编写openai风格ai支持的属性，比如 temperature stream，国内模型我测试的不太适合流式返回
`
export function AIAgentChatSetting() {

    const {t} = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const [ai_agent_chat_setting, set_ai_agent_chat_setting] = useRecoilState($stroe.ai_agent_chat_setting);
    const headers = [t("编号"),t("url"), t("是否开启"), t("token"),"model",t("系统prompt"),t("备注") ];
    const [rows, setRows] = useState<ai_agent_Item>([]);
    const tip = using_tip()
    const {check_user_auth} = use_auth_check();
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);

    const getItems = async () => {
        // 文件夹根路径
        const result = await settingHttp.get("ai_agent_setting");
        if (result.code === RCode.Sucess) {
            setRows(result.data.models);
        }
    }
    useEffect(()=>{
        getItems()
    },[])

    const onChange = (item,value,index)=> {
        const list = [];
        for (let i=0; i<rows.length; i++) {
            if (i !== index) {
                rows[i].open = false;
            } else {
                rows[i].open = value === "true";
            }
            list.push(rows[i])
        }
        setRows(list);
    }
    const add = ()=>{
        setRows([...rows,{note:"",open:false,path:""}]);
    }
    const del = (index) => {
        rows.splice(index, 1);
        setRows([...rows]);
    }
    const copy = (index) => {
        setRows([...rows,{...rows[index],open: false}]);
    }
    const save = async () => {
        for (let i =0; i<rows.length;i++) {
            rows[i].index = i;
        }
        const result = await settingHttp.post("ai_agent_setting/save", {models:rows});
        if (result.code === RCode.Sucess) {
            NotySucess("保存成功")
        }
    }
    return <div>
        <Header>
            {check_user_auth(UserAuth.ai_agent_setting) &&
                <ActionButton icon={"close"} title={t("关闭")} onClick={() => {
                    set_ai_agent_chat_setting(false)
                }}/>
            }
        </Header>
        <FullScreenDiv isFull={true} more={true}>
            <FullScreenContext>
                <Column widthPer={70}>
                    <CardFull self_title={<span className={" div-row "}><h2>{t("Model设置")}</h2> <ActionButton icon={"info"} onClick={()=>{tip(tip_text)}} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={save}/></div>}>
                        <Table headers={headers} rows={rows.map((item, index) => {
                            const new_list = [
                                <div>{index}</div>,
                                <InputText value={item.url} handleInputChange={(value) => {
                                    item.url = value;
                                }} no_border={true}/>,
                                <Select value={item.open} onChange={(value) => {
                                    onChange(item,value,index);
                                }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                                <InputText value={item.token} handleInputChange={(value) => {
                                    item.token = value;
                                }} no_border={true}/>,
                                <InputText value={item.model} handleInputChange={(value) => {
                                    item.model = value;
                                }} no_border={true}/>,
                                <ActionButton icon={"short_text"} title={"prompt"} onClick={() => {
                                    editor_data.set_value_temp(rows[index].sys_prompt??'')
                                    setEditorSetting({
                                        model: "ace/mode/text",
                                        open: true,
                                        fileName: "",
                                        save:async (context)=>{
                                            rows[index].sys_prompt = context
                                            setRows(rows)
                                            editor_data.set_value_temp('')
                                            // console.log(context)
                                        }
                                    })
                                }}/>,
                                <InputText value={item.note} handleInputChange={(value) => {
                                    item.note = value;
                                }} no_border={true}/>,
                                <div>
                                    <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/>
                                    <ActionButton icon={"copy_all"} title={t("复制")} onClick={() => copy(index)}/>
                                    <ActionButton icon={"edit_attributes"} title={"model请求参数json编写"} onClick={() => {
                                        editor_data.set_value_temp(rows[index].json_params??'{}')
                                        setEditorSetting({
                                            model: "ace/mode/json",
                                            open: true,
                                            fileName: "",
                                            save:async (context)=>{
                                                rows[index].json_params = context
                                                setRows(rows)
                                                editor_data.set_value_temp('')
                                                // console.log(context)
                                            }
                                        })
                                    }}/>
                                </div>,
                            ];
                            return new_list;
                        })} width={"10rem"}/>
                    </CardFull>
                </Column>


            </FullScreenContext>
        </FullScreenDiv>
    </div>;

}