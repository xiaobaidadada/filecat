import {useTranslation} from "react-i18next";
import React, {useContext, useEffect, useRef, useState} from "react";
import {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Column, Dashboard, FullScreenContext, FullScreenDiv, Row, TextLine} from "../../../meta/component/Dashboard";
import {Table} from "../../../meta/component/Table";
import {InputText, Select} from "../../../meta/component/Input";
import {Card, CardFull} from "../../../meta/component/Card";
import {using_tip} from "../prompts/prompts.util";
import {settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySucess} from "../../util/noty";
import {GlobalContext} from "../../GlobalProvider";
import {editor_data, use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {
    ai_agent_Item,
    ai_agent_item_dotenv_default,
    ai_docs_item,
    ai_docs_load_info,
    ai_docs_setting,
    ai_docs_setting_param_default,
    json_params_default
} from "../../../../common/req/setting.req";
import {useNavigate} from "react-router-dom";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import { formatFileSize } from "../../../../common/ValueUtil";


const tip_text = `
1. 只能使用符合openai风格的ai接口，接口不能只填域名，而是类似 https://ark.cn-beijing.volces.com/api/v3/chat/completions 这样的全路径链接聊天url
2. 对话的历史越长，消耗的大模型token费用越贵，目前不具备长期记忆简化能力，可以在系统prompt中设置一下让AI回答的简洁一点，节省tokens
3. model请求参数json编写，里面只能编写json,来用于编写openai风格ai支持的属性，比如 temperature thinking（豆包的深度思考开关）等
4. 可以在model请求参数中开启 "stream":true 提高响应速度
5. 深度思考现在会影响输出速度，建议设置\`{
    "thinking" : { 
                "type":"disabled"
    }
}\`关闭(豆包例子)
6. 使用AI功能来查询服务器信息，那么AI就需要能够之一些命令，需要先在用户设置中，给用户设置命令权限，建议设置 \`*\` 允许全部命令，在设置禁止不能执行的危险命令。
`
const docs_tip = `
1. 本地知识库用于为AI增强理解能力，或者分析本地文件，原理读取本地的文件，对文件在内存中建立全文索引，为AI提供额外数据（需要有模型开启才能使用)
2. 该功能只能用于小型知识库，作为本地小型或者公司内部资料使用还是没有问题的
3. 每次保存都会重新加载知识库中的文件，不会全部重新加载，而是检测哪些文件有变更
`
export default function AIAgentChatSetting() {

    const {t} = useTranslation();
    const {initUserInfo,reloadUserInfo} = useContext(GlobalContext);
    const headers = [t("编号"),t("url"), t("是否开启"), t("token"),"model",t("prompt|model|setting"),t("备注") ];
    const headers_docs = [t("编号"),t("本地目录"), t("是否开启"),t("备注") ];

    const [rows, setRows] = useState<ai_agent_Item>([]);
    const [docs_list,set_docs_list] = useState<ai_docs_item>([]);
    const [load_info,set_load_info] = useState<ai_docs_load_info>(null);
    const docs_param = useRef();

    const tip = using_tip()
    const {check_user_auth} = use_auth_check();
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const navigate = useNavigate();
    const getItems = async () => {
        // 文件夹根路径
        const result = await settingHttp.get("ai_agent_setting");
        if (result.code === RCode.Sucess) {
            setRows(result.data.models);
        }

        await ws.addMsg(CmdType.ai_load_info, (data:WsData<ai_docs_load_info>)=>{
            // console.log(data)
            set_load_info(data.context)
        })
        const info = await ws.sendData(CmdType.ai_load_info, {})
        // console.log(info)
        set_load_info(info.context)
        const docs_result = await settingHttp.get("ai_docs_setting");
        if (docs_result.code === RCode.Sucess && docs_result.data.list?.length) {
            // console.log()
            docs_param.current = docs_result.data.param;
            if(docs_result.data.list?.length) {
                set_docs_list(docs_result.data.list);
            }
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
    const add_docs = ()=>{
        set_docs_list([...docs_list,{note:"",open:false,dir:""}]);
    }
    const del = (index) => {
        rows.splice(index, 1);
        setRows([...rows]);
    }
    const del_docs = (index) => {
        docs_list.splice(index, 1);
        set_docs_list([...docs_list]);
    }
    const copy = (index) => {
        setRows([...rows,{...rows[index],open: false}]);
    }
    const save = async (data_rows?:any) => {
        for (let i =0; i<rows.length;i++) {
            rows[i].index = i;
        }
        const result = await settingHttp.post("ai_agent_setting/save", {models:data_rows??rows});
        if (result.code === RCode.Sucess) {
            NotySucess("保存成功")
        }
    }
    const save_docs = async (param?:any) => {
        for (let i =0; i<rows.length;i++) {
            rows[i].index = i;
        }
        let body:any = {
            list:docs_list
        }
        if(param) {
            body = {
                param:param
            }
        }
        const result = await settingHttp.post("ai_docs_setting_save", body);
        if (result.code === RCode.Sucess) {
            NotySucess("保存成功")
        }
    }
    return <div>
        <Header>
            {check_user_auth(UserAuth.ai_agent_setting) &&
                <ActionButton icon={"arrow_back"} title={t("上一页")} onClick={() => {
                    navigate(-1)
                }}/>
            }
        </Header>
        <FullScreenDiv isFull={true} more={true}>
            <FullScreenContext>
                <Dashboard>
                    <Row>
                        <Column widthPer={70}>
                            <CardFull self_title={<span className={" div-row "}><h2>{t("Model设置")}</h2> <ActionButton icon={"info"} onClick={()=>{tip(tip_text)}} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={()=>{
                                save()
                            }}/></div>}>
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
                                        <div>
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
                                                        save(rows)
                                                        // console.log(context)
                                                    }
                                                })
                                            }}/>
                                            <ActionButton icon={"edit_attributes"} title={"model请求参数json编写"} onClick={() => {
                                                editor_data.set_value_temp(rows[index].json_params??json_params_default)
                                                setEditorSetting({
                                                    model: "ace/mode/json",
                                                    open: true,
                                                    fileName: "",
                                                    save:async (context)=>{
                                                        rows[index].json_params = context
                                                        setRows(rows)
                                                        editor_data.set_value_temp('')
                                                        save(rows)
                                                        // console.log(context)
                                                    },
                                                    can_format:true
                                                })
                                            }}/>
                                            <ActionButton icon={"settings"} title={"额外参数设置"} onClick={() => {
                                                editor_data.set_value_temp(rows[index].dotenv||ai_agent_item_dotenv_default)
                                                setEditorSetting({
                                                    model: "ace/mode/ini",
                                                    open: true,
                                                    fileName: "",
                                                    save:async (context)=>{
                                                        rows[index].dotenv = context
                                                        setRows(rows)
                                                        editor_data.set_value_temp('')
                                                        save(rows)
                                                        // console.log(context)
                                                    }
                                                })
                                            }}/>
                                        </div>
                                        ,
                                        <InputText value={item.note} handleInputChange={(value) => {
                                            item.note = value;
                                        }} no_border={true}/>,
                                        <div>
                                            <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/>
                                            <ActionButton icon={"copy_all"} title={t("复制")} onClick={() => copy(index)}/>
                                        </div>,
                                    ];
                                    return new_list;
                                })} width={"10rem"}/>
                            </CardFull>
                        </Column>
                    </Row>
                    <Row>
                        <Column widthPer={50}>
                                <CardFull self_title={<span className={" div-row "}><h2>{t("本地知识库")}</h2> <ActionButton icon={"info"} onClick={()=>{tip(docs_tip)}} title={"信息"}/></span>}
                                          titleCom={<div>
                                              <ActionButton icon={"settings"} title={"额外参数设置"} onClick={() => {
                                                  editor_data.set_value_temp(docs_param.current||ai_docs_setting_param_default)
                                                  setEditorSetting({
                                                      model: "ace/mode/ini",
                                                      open: true,
                                                      fileName: "",
                                                      save:async (context)=>{
                                                          docs_param.current = context
                                                          editor_data.set_value_temp('')
                                                          save_docs(docs_param.current)
                                                      }
                                                  })
                                              }}/>
                                              <ActionButton icon={"add"} title={t("添加")} onClick={add_docs}/>
                                              <ActionButton icon={"save"} title={t("保存")} onClick={()=>{
                                                  save_docs()
                                              }}
                                              />
                                          </div>}>
                                    <Table headers={headers_docs} rows={docs_list.map((item, index) => {
                                        const new_list = [
                                            <div>{index}</div>,
                                            <InputText value={item.dir} handleInputChange={(value) => {
                                                item.dir = value;
                                            }} no_border={true}/>,
                                            <Select value={item.open} onChange={(value) => {
                                                item.open = value === 'true';
                                                set_docs_list([...docs_list]);
                                            }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                                            <InputText value={item.note} handleInputChange={(value) => {
                                                item.note = value;
                                            }} no_border={true}/>,
                                            <div>
                                                <ActionButton icon={"delete"} title={t("删除")} onClick={() => del_docs(index)}/>
                                            </div>,
                                        ];
                                        return new_list;
                                    })} width={"10rem"}/>
                                </CardFull>
                        </Column>
                        {
                            load_info &&
                            <Column widthPer={50}>
                                <Card title={t("知识库加载信息")}>
                                    <TextLine left={t("最近一次加载，加载进度")} right={load_info?.progress}/>
                                    <TextLine left={`${t("最近一次加载，总文件数量")}`} right={load_info?.num}/>
                                    <TextLine left={`${t("最近一次加载，总文件字符数量")}`} right={load_info?.char_num}/>
                                    <TextLine left={`${t("最近一次加载，总文件大小")}`} right={formatFileSize(load_info?.size)}/>
                                    <TextLine left={`${t("总文件数量")}`} right={load_info?.total_num}/>
                                </Card>
                            </Column>
                        }
                    </Row>
                </Dashboard>
            </FullScreenContext>
        </FullScreenDiv>
    </div>;

}