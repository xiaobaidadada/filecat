import {useTranslation} from "react-i18next";
import React, {useContext, useEffect, useRef, useState} from "react";
import Switch, {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Column, Dashboard, FullScreenContext, FullScreenDiv, Row, TextLine} from "../../../meta/component/Dashboard";
import {Table} from "../../../meta/component/Table";
import {InputText, Select} from "../../../meta/component/Input";
import {Card, CardFull} from "../../../meta/component/Card";
import {using_tip} from "../prompts/prompts.util";
import {ai_agentHttp, settingHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotySucess} from "../../util/noty";
import {GlobalContext} from "../../GlobalProvider";
import {editor_data, use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {
    ai_agent_Item,
    ai_agent_item_dotenv_default, ai_docs_item, ai_docs_load_info, ai_mcp_server_item, ai_mcp_server_tool_group,
    ai_system_prompt_item,
    json_params_default
} from "../../../../common/req/setting.req";
import {useNavigate} from "react-router-dom";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {formatDuration, formatFileSize} from "../../../../common/ValueUtil";
import {using_confirm} from "../prompts/prompt.util";

import {PromptPageItem, SwitchPagePrompt} from "../prompts/PromptCard";

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
const mcp_tip = `
1. 这里配置的是 MCP Client 启动参数，当前实现的是 stdio 模式，也就是通过 command + args 启动本地 MCP Server
2. 例如可以填 npx / uvx / python 等命令，再配合对应的 MCP server 包参数
3. 保存后会自动重新加载 MCP 工具，agent 聊天时会把这些工具一起带给模型
4. 建议把 cwd 配到具体项目目录，避免 server 在错误目录里运行
`
const sys_prompt_tip = `
1. 系统会话提示词，在 AI 聊天页创建会话时可以选择，选中的提示词会自动填入聊天框作为第一条系统消息
2. 适用于预先设定常用的会话场景模板，如"代码审查"、"翻译助手"、"运维诊断"等
`
export default function AIAgentChatSetting() {

    const {t} = useTranslation();
    const {initUserInfo,} = useContext(GlobalContext);
    const headers = [t("编号"),t("url"), t("是否开启"), t("token"),"model",t("prompt|model|setting"),t("备注") ];
    const headers_docs = [t("编号"),t("本地目录"), t("自动加载"),t("备注") ];
    const [rows, setRows] = useState<ai_agent_Item[]>([]);
    const [docs_list,set_docs_list] = useState<ai_docs_item[]>([]);
    const [mcp_list,set_mcp_list] = useState<ai_mcp_server_item[]>([]);
    const [load_info,set_load_info] = useState<ai_docs_load_info>(null);
    const docs_param = useRef();
    const mcp_update_tag = useRef(false);
    const docs_update_tag = useRef(false);
    const [mcp_tool_groups, set_mcp_tool_groups] = useState<ai_mcp_server_tool_group[]>([]);
    const [mcp_tool_loading, set_mcp_tool_loading] = useState(false);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const [index_switch,set_index_switch] = useState(false);
    const mcp_stdio_list = mcp_list.filter((item) => (item.transport ?? "stdio") !== "http");
    const mcp_http_list = mcp_list.filter((item) => item.transport === "http");
    const headers_mcp_stdio = [t("编号"),t("名称"), t("是否开启"),"command", "args", "cwd", t("tools|env"), t("备注")];
    const headers_mcp_http = [t("编号"),t("名称"), t("是否开启"), t("endpoint"), t("tools|headers"), t("备注")];
    const headers_sys_prompt = [t("编号"), t("提示词"), t("备注"), t("操作")];

    // 系统会话提示词
    const [sys_prompt_list, set_sys_prompt_list] = useState<ai_system_prompt_item[]>([]);

    const tip = using_tip()
    const {check_user_auth} = use_auth_check();
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const navigate = useNavigate();
    const confirm_dell_all = using_confirm()

    const load_index_switch = async () => {
        const r = await ai_agentHttp.get("docs_on_get")
        if (r.code === RCode.Success) {
            set_index_switch(r.data)
        }
    }

    const getItems = async () => {
        // 文件夹根路径
        const result = await settingHttp.get("ai_agent_setting");
        if (result.code === RCode.Success) {
            setRows(result.data.models);
        }

        await ws.addMsg(CmdType.ai_load_info, (data:WsData<ai_docs_load_info>)=>{
            // console.log(data)
            set_load_info(data.context)
        })
        const info = await ws.sendData(CmdType.ai_load_info, {})
        // console.log(info)
        if(info?.context)
            set_load_info(info.context)
        const docs_result = await settingHttp.get("ai_docs_setting");
        if (docs_result.code === RCode.Success) {
            // console.log()
            docs_param.current = docs_result.data.param;
            if(docs_result.data.list?.length) {
                set_docs_list(docs_result.data.list);
            }
        }

        const mcp_result = await settingHttp.get("ai_mcp_setting");
        if (mcp_result.code === RCode.Success) {
            set_mcp_list(mcp_result.data.list ?? []);
        }

        await loadMcpTools();

        load_index_switch()

        // 加载系统提示词
        const sys_prompt_result = await settingHttp.get("ai_system_prompts");
        if (sys_prompt_result.code === RCode.Success) {
            set_sys_prompt_list(sys_prompt_result.data ?? []);
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
                rows[i].open = value;
            }
            list.push(rows[i])
        }
        setRows(list);
    }
    const add = ()=>{
        setRows([...rows,{note:"",open:false,path:"",dotenv:ai_agent_item_dotenv_default,json_params : json_params_default}]);
    }
    const add_docs = ()=>{
        set_docs_list([...docs_list,{note:"",auto_load:false,dir:""}]);
        docs_update_tag.current = true;
    }
    const add_mcp = (transport:"stdio"|"http" = "stdio")=>{
        const new_item: any = transport === "http"
            ? {name:"",open:false,note:"",transport:"http",endpoint:"",headers:"",stream:false,timeout_ms:10000}
            : {name:"",open:false,command:"",args:"",cwd:"",env:"",note:"",transport:"stdio",timeout_ms:10000};
        set_mcp_list([...mcp_list, new_item]);
        mcp_update_tag.current = true;
    }
    const del = (index) => {
        rows.splice(index, 1);
        setRows([...rows]);
    }
    const del_docs = (index) => {
        docs_list.splice(index, 1);
        set_docs_list([...docs_list]);
        docs_update_tag.current = true;
    }
    const del_mcp = (item: ai_mcp_server_item) => {
        const index = mcp_list.indexOf(item);
        if (index < 0) return;
        mcp_list.splice(index, 1);
        set_mcp_list([...mcp_list]);
        mcp_update_tag.current = true;
    }
    const copy = (index) => {
        setRows([...rows,{...rows[index],open: false}]);
    }
    const copy_mcp = (item: ai_mcp_server_item) => {
        set_mcp_list([...mcp_list,{...item,open:false}]);
        mcp_update_tag.current = true;
    }
    const save = async (data_rows?:any) => {
        for (let i =0; i<rows.length;i++) {
            rows[i].index = i;
        }
        const result = await settingHttp.post("ai_agent_setting/save", {models:data_rows??rows});
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
        }
    }
    const save_mcp = async (data_rows?:any) => {
        for (let i =0; i<mcp_list.length;i++) {
            mcp_list[i].index = i;
        }
        const result = await settingHttp.post("ai_mcp_setting/save", {list:data_rows??mcp_list});
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
            mcp_update_tag.current = false;
            await loadMcpTools();
        }
    }
    const loadMcpTools = async () => {
        const result = await settingHttp.get("ai_mcp_tools");
        if (result.code === RCode.Success) {
            set_mcp_tool_groups(result.data ?? []);
            return result.data ?? [];
        }
        return [];
    }
    // const reloadAllMcpTools = async () => {
    //     set_mcp_tool_loading(true);
    //     try {
    //         const result = await settingHttp.post("ai_mcp_tools/reload_all", {});
    //         if (result.code === RCode.Success) {
    //             set_mcp_tool_groups(result.data ?? []);
    //             NotySucess("MCP工具加载成功")
    //             return result.data ?? [];
    //         }
    //     } finally {
    //         set_mcp_tool_loading(false);
    //     }
    //     return [];
    // }
    const reloadOneMcpTools = async (index: number) => {
        set_mcp_tool_loading(true);
        try {
            const result = await settingHttp.post("ai_mcp_tools/reload", {index});
            if (result.code === RCode.Success) {
                await loadMcpTools();
                NotySucess("MCP工具加载成功")
                return result.data ?? null;
            }
        } finally {
            set_mcp_tool_loading(false);
        }
        return null;
    }
    const showMcpTools = async (item: ai_mcp_server_item, index: number, initialSelectedToolName?: string, groupOverride?: ai_mcp_server_tool_group | null) => {
        const group = groupOverride ?? mcp_tool_groups.find((it) => it.index === index) ?? {
            index,
            key: `${index}`,
            name: item.name ?? "",
            note: item.note,
            transport: item.transport ?? "stdio",
            open: !!item.open,
            loaded: false,
            tool_count: 0,
            tools: [],
        };
        const pages: PromptPageItem[] = (group.tools ?? []).map((tool) => ({
            id: tool.runtime_name,
            title: tool.tool_name,
            subtitle: tool.description || t("无描述"),
            detail: tool.display_name,
            meta: tool.runtime_name
        }));
        set_prompt_card({
            open: true,
            title: `${item.name || item.note || index} MCP工具`,
            context_div: (
                <SwitchPagePrompt
                    title={`${item.name || item.note || index} MCP工具`}
                    subtitle={`${group.transport ?? "stdio"} | ${group.open ? t("是") : t("否")} | ${group.loaded ? "loaded" : "idle"} | ${group.tool_count} tools`}
                    pages={pages}
                    initialPageId={initialSelectedToolName}
                    onRefresh={async () => {
                        const fresh = await reloadOneMcpTools(index);
                        if (fresh) {
                            await showMcpTools(item, index, initialSelectedToolName, fresh);
                        }
                    }}
                    // onClose={() => set_prompt_card({open: false})}
                    renderPage={(page) => {
                        if (!page) {
                            return <div className="prompt-switch-page__empty">{t("暂无工具")}</div>;
                        }
                        const tool = group.tools?.find((it) => it.runtime_name === page.id);
                        if (!tool) {
                            return <div className="prompt-switch-page__empty">{t("暂无工具")}</div>;
                        }
                        return (
                            <div className="prompt-switch-page__detail">
                                <div className="prompt-switch-page__detail-title">{tool.display_name}</div>
                                <div className="prompt-switch-page__detail-desc">{tool.description || t("无描述")}</div>
                                <div className="prompt-switch-page__detail-row">
                                    <strong>runtime:</strong> {tool.runtime_name}
                                </div>
                                <div>
                                    <strong>schema:</strong>
                                    <pre className="prompt-switch-page__schema">{JSON.stringify(tool.input_schema ?? {}, null, 2)}</pre>
                                </div>
                            </div>
                        );
                    }}
                />
            ),
            cancel: () => set_prompt_card({open: false})
        });
    }
    const renderMcpToolsCell = (item: ai_mcp_server_item) => {
        const index = mcp_list.indexOf(item);
        const group = mcp_tool_groups.find((it) => it.index === index);
        const tools = group?.tools ?? [];
        return (
            <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: ".25rem"
            }}>
                {tools.length ? tools.map((tool) => (
                    <button
                        key={tool.runtime_name}
                        className="button button--flat button--grey"
                        style={{
                            padding: ".25rem .55rem",
                            minHeight: "auto",
                            lineHeight: 1.4
                        }}
                        onClick={() => showMcpTools(item, index, tool.runtime_name)}
                    >
                        {tool.tool_name}
                    </button>
                )) : (
                    <button
                        className="button button--flat button--grey"
                        style={{
                            padding: ".25rem .55rem",
                            minHeight: "auto",
                            lineHeight: 1.4
                        }}
                        onClick={async () => {
                            const fresh = await reloadOneMcpTools(index);
                            if (fresh) {
                                await showMcpTools(item, index, fresh.tools?.[0]?.runtime_name, fresh);
                            }
                        }}
                    >
                        {group ? t("查看工具") : t("加载工具")}
                    </button>
                )}
            </div>
        );
    }
    const save_docs = async (param?:any) => {
        for (let i =0; i<rows.length;i++) {
            rows[i].index = i;
        }
        let body:any = {
            list:docs_list,
            docs_update_tag:docs_update_tag.current
        }
        if(param != null) {
            body = {
                param:param
            }
        }
        docs_update_tag.current = false;
        const result = await settingHttp.post("ai_docs_setting_save", body);
        if (result.code === RCode.Success) {
            NotySucess("保存成功")
        }
    }
    // 系统会话提示词相关
    const add_sys_prompt = () => {
        set_sys_prompt_list([...sys_prompt_list, {prompt: "", note: ""}]);
    }
    const del_sys_prompt = (index: number) => {
        sys_prompt_list.splice(index, 1);
        set_sys_prompt_list([...sys_prompt_list]);
    }
    const save_sys_prompts = async () => {
        for (let i = 0; i < sys_prompt_list.length; i++) {
            sys_prompt_list[i].index = i;
        }
        const result = await settingHttp.post("ai_system_prompts/save", {list: sys_prompt_list});
        if (result.code === RCode.Success) {
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
                            <CardFull self_title={<span className={" div-row "}><h2>{t("Model")+" "+t("设置")}</h2> <ActionButton icon={"info"} onClick={()=>{tip(tip_text)}} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add}/><ActionButton icon={"save"} title={t("保存")} onClick={()=>{
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
                                                editor_data.set_value_temp(rows[index].json_params)
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
                                                editor_data.set_value_temp(rows[index].dotenv)
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
                        <Column widthPer={70}>
                            <CardFull self_title={<span className={" div-row "}><h2>{t("MCP")+" "+t("设置")} - stdio</h2> <ActionButton icon={"info"} onClick={()=>{tip(mcp_tip)}} title={"信息"}/></span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={()=>add_mcp("stdio")}/>
                                <ActionButton icon={"save"} title={t("保存")} onClick={()=>{
                                save_mcp()
                            }}/></div>}>
                                <Table headers={headers_mcp_stdio} rows={mcp_stdio_list.map((item, index) => {
                                    const sourceIndex = mcp_list.indexOf(item);
                                    const new_list = [
                                        <div>{index}</div>,
                                        <InputText value={item.name} handleInputChange={(value) => {
                                            item.name = value;
                                            mcp_update_tag.current = true
                                        }} no_border={true}/>,
                                        <Select value={item.open} onChange={(value) => {
                                            item.open = value ;
                                            set_mcp_list([...mcp_list]);
                                            mcp_update_tag.current = true
                                        }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                                        <InputText value={item.command} handleInputChange={(value) => {
                                            item.command = value;
                                            mcp_update_tag.current = true
                                        }} no_border={true}/>,
                                        <InputText value={item.args} handleInputChange={(value) => {
                                            item.args = value;
                                            mcp_update_tag.current = true
                                        }} no_border={true}/>,
                                        <InputText value={item.cwd} handleInputChange={(value) => {
                                            item.cwd = value;
                                            mcp_update_tag.current = true
                                        }} no_border={true}/>,
                                        // renderMcpToolsCell(item),
                                        <div>
                                            {/*<ActionButton icon={"play_arrow"} title={"加载此服务工具"} onClick={async () => {*/}
                                            {/*    await reloadOneMcpTools(sourceIndex);*/}
                                            {/*}}/>*/}
                                            <ActionButton icon={"visibility"} title={"查看工具"} onClick={() => {
                                                showMcpTools(item, sourceIndex);
                                            }}/>
                                            <ActionButton icon={"settings"} title={"env"} onClick={() => {
                                                editor_data.set_value_temp(item.env ?? '')
                                                setEditorSetting({
                                                    model: "ace/mode/ini",
                                                    open: true,
                                                    fileName: "",
                                                    save:async (context)=>{
                                                        item.env = context
                                                        set_mcp_list([...mcp_list])
                                                        editor_data.set_value_temp('')
                                                        mcp_update_tag.current = true
                                                        save_mcp()
                                                    }
                                                })
                                            }}/>
                                        </div>,
                                        <InputText value={item.note} handleInputChange={(value) => {
                                            item.note = value;
                                            mcp_update_tag.current = true
                                        }} no_border={true}/>,
                                        <div>
                                            <ActionButton icon={"delete"} title={t("删除")} onClick={() => del_mcp(item)}/>
                                            <ActionButton icon={"copy_all"} title={t("复制")} onClick={() => copy_mcp(item)}/>
                                        </div>,
                                    ];
                                    return new_list;
                                })} width={"10rem"}/>
                            </CardFull>
                        </Column>
                    </Row>
                    <Row>
                        <Column widthPer={70}>
                            <CardFull self_title={<span className={" div-row "}><h2>{t("MCP")+" "+t("设置")} - HTTP</h2> </span>} titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={()=>add_mcp("http")}/>
                                <ActionButton icon={"save"} title={t("保存")} onClick={()=>{
                                save_mcp()
                            }}/></div>}>
                                <Table headers={headers_mcp_http} rows={mcp_http_list.map((item, index) => {
                                    const sourceIndex = mcp_list.indexOf(item);
                                    const new_list = [
                                        <div>{index}</div>,
                                        <InputText value={item.name} handleInputChange={(value) => {
                                            item.name = value;
                                            mcp_update_tag.current = true
                                        }} no_border={true}/>,
                                        <Select value={item.open} onChange={(value) => {
                                            item.open = value ;
                                            set_mcp_list([...mcp_list]);
                                            mcp_update_tag.current = true
                                        }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                                        <InputText value={item.endpoint} handleInputChange={(value) => {
                                            item.endpoint = value;
                                            mcp_update_tag.current = true
                                        }} no_border={true}/>,
                                        // renderMcpToolsCell(item),
                                        <div>
                                            {/*<ActionButton icon={"play_arrow"} title={"加载此服务工具"} onClick={async () => {*/}
                                            {/*    await reloadOneMcpTools(sourceIndex);*/}
                                            {/*}}/>*/}
                                            <ActionButton icon={"visibility"} title={"查看工具"} onClick={() => {
                                                showMcpTools(item, sourceIndex);
                                            }}/>
                                            <ActionButton icon={"settings"} title={"headers"} onClick={() => {
                                                editor_data.set_value_temp(item.headers ?? '')
                                                setEditorSetting({
                                                    model: "ace/mode/ini",
                                                    open: true,
                                                    fileName: "",
                                                    save:async (context)=>{
                                                        item.headers = context
                                                        set_mcp_list([...mcp_list])
                                                        editor_data.set_value_temp('')
                                                        mcp_update_tag.current = true
                                                        save_mcp()
                                                    }
                                                })
                                            }}/>
                                        </div>,
                                        <InputText value={item.note} handleInputChange={(value) => {
                                            item.note = value;
                                            mcp_update_tag.current = true
                                        }} no_border={true}/>,
                                        <div>
                                            <ActionButton icon={"delete"} title={t("删除")} onClick={() => del_mcp(item)}/>
                                            <ActionButton icon={"copy_all"} title={t("复制")} onClick={() => copy_mcp(item)}/>
                                        </div>,
                                    ];
                                    return new_list;
                                })} width={"10rem"}/>
                            </CardFull>

                            <CardFull self_title={<span className={" div-row "}><h2>{t("系统会话提示词")}</h2> <ActionButton icon={"info"} onClick={()=>{tip(sys_prompt_tip)}} title={"信息"}/></span>}
                                      titleCom={<div><ActionButton icon={"add"} title={t("添加")} onClick={add_sys_prompt}/>
                                          <ActionButton icon={"save"} title={t("保存")} onClick={()=>{
                                              save_sys_prompts()
                                          }}/></div>}>
                                <Table headers={headers_sys_prompt} rows={sys_prompt_list.map((item, index) => {
                                    const new_list = [
                                        <div>{index}</div>,
                                        <div>
                                            <ActionButton icon={"short_text"} title={t("提示词")} onClick={() => {
                                                editor_data.set_value_temp(item.prompt ?? '')
                                                setEditorSetting({
                                                    model: "ace/mode/text",
                                                    open: true,
                                                    fileName: "",
                                                    save:async (context)=>{
                                                        item.prompt = context
                                                        set_sys_prompt_list([...sys_prompt_list])
                                                        editor_data.set_value_temp('')
                                                        save_sys_prompts()
                                                    }
                                                })
                                            }}/>
                                        </div>,
                                        <InputText value={item.note} handleInputChange={(value) => {
                                            item.note = value;
                                        }} no_border={true}/>,
                                        <div>
                                            <ActionButton icon={"delete"} title={t("删除")} onClick={() => del_sys_prompt(index)}/>
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

                                              <Switch checked={index_switch} onChange={async (v)=>{
                                                  await ai_agentHttp.post("docs_on_set", {
                                                      status: v
                                                  });
                                                  load_index_switch()
                                                  initUserInfo()
                                              }} title={t("知识库开关")}/>

                                              <ActionButton icon={"settings"} title={"额外参数设置"} onClick={() => {
                                                  editor_data.set_value_temp(docs_param.current)
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

                                              {/*<ActionButton icon={"restore"} title={t("重新创建索引")} onClick={()=>{*/}
                                              {/*    confirm_dell_all({*/}
                                              {/*        sub_title:"确认重建索引吗",*/}
                                              {/*        confirm_fun:()=>{*/}
                                              {/*            ai_agentHttp.post("ai_load_restart", {});*/}
                                              {/*            NotySucess("ok")*/}
                                              {/*        }*/}
                                              {/*    })*/}
                                              {/*}}*/}
                                              {/*/>*/}
                                              {/*<ActionButton icon={"close"} title={t("关闭索引")} onClick={()=>{*/}
                                              {/*    confirm_dell_all({*/}
                                              {/*        sub_title:"关闭索引",*/}
                                              {/*        confirm_fun:()=>{*/}
                                              {/*            ai_agentHttp.post("ai_load_close", {});*/}
                                              {/*            NotySucess("ok")*/}
                                              {/*        }*/}
                                              {/*    })*/}
                                              {/*}}*/}

                                              {/*/>*/}
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
                                                docs_update_tag.current = true
                                            }} no_border={true}/>,
                                            <Select value={item.auto_load} onChange={(value) => {
                                                item.auto_load = value;
                                                set_docs_list([...docs_list]);
                                                docs_update_tag.current = true
                                            }}  options={[{title:t("是"),value:true},{title:t("否"),value:false}]} no_border={true}/>,
                                            <InputText value={item.note} handleInputChange={(value) => {
                                                item.note = value;
                                            }} no_border={true}/>,
                                            <div>
                                                <ActionButton icon={"delete"} title={t("删除记录")} onClick={() => del_docs(index)}/>
                                                <ActionButton icon={"restore"} title={t("手动加载")} onClick={()=>{
                                                    confirm_dell_all({
                                                        sub_title:"手动加载",
                                                        confirm_fun:()=>{
                                                            ai_agentHttp.post("ai_load_one_file", {
                                                                param_path:item.dir
                                                            });
                                                            NotySucess("ok")
                                                        }
                                                    })
                                                }}
                                                />
                                                <ActionButton icon={"delete_forever"} title={t("从索引删除")} onClick={()=>{
                                                    confirm_dell_all({
                                                        sub_title:"从索引删除",
                                                        confirm_fun:()=>{
                                                            ai_agentHttp.post("ai_del", {
                                                                param_path:item.dir
                                                            });
                                                            NotySucess("ok")
                                                        }
                                                    })
                                                }}
                                                />
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
                                    <TextLine left={t("最近一次加载")+"，"+t("加载进度")} right={load_info?.progress}/>
                                    <TextLine left={`${t(`最近一次加载`)}，${t(`总文件数量`)}`} right={load_info?.num}/>
                                    <TextLine left={`${t("最近一次加载")}，${t("总文件字符数量")}`} right={load_info?.char_num}/>
                                    <TextLine left={`${t("最近一次加载")}，${t("总文件大小")}`} right={formatFileSize(load_info?.size)}/>
                                    <TextLine left={`${t("最近一次加载")}，${t("总耗时")}`} right={formatDuration(load_info?.consume_time_ms_len)}/>
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
