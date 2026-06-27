import React, { useEffect, useState } from 'react'
import { NavIndexContainer } from "../navindex/component/NavIndexContainer";
import { Column, Dashboard, Row } from "../../../meta/component/Dashboard";
import { ActionButton } from "../../../meta/component/Button";
import { InputRadio, InputText, InputTextIcon, Select } from "../../../meta/component/Input";
import Header from "../../../meta/component/Header";
import { useTranslation } from "react-i18next";
import { Rows, Table } from "../../../meta/component/Table";
import { Card, TextTip } from "../../../meta/component/Card";
import { netHttp } from "../../util/config";
import { RCode } from "../../../../common/Result.pojo";
import { useAtom } from "jotai";
import { $stroe } from "../../util/store";
import { NotyFail, NotySuccess } from "../../util/noty";
import { copyToClipboard } from "../../util/FunUtil";
import { editor_data, use_auth_check } from "../../util/store.util";
import { http_body_type, http_download_map, HttpFormData, HttpFormPojo } from "../../../../common/req/net.pojo";
import { PromptEnum } from "../prompts/Prompt";
import { generateRandomHash } from "../../../../common/StringUtil";
import axios, { AxiosResponse } from "axios";
import { UserAuth } from "../../../../common/req/user.req";
import { ws } from "../../util/ws";
import { CmdType, WsData } from "../../../../common/frame/WsData";
import { formatFileSize } from '../../../../common/ValueUtil';

// 引入刚才编写的 Tab 组件
import { Tabs, TabPanel } from "../../../meta/component/Tabs";

const Ace = React.lazy(() => import("../file/component/Ace"));

let http_header_value;
let http_body_value;
let respone_body;
let respone_headers;

export function Http() {
    const { t } = useTranslation();
    const [confirm, set_confirm] = useAtom($stroe.confirm);
    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const { check_user_auth } = use_auth_check();

    const [status_body, set_status_body] = useState('');
    const [router_jump, set_router_jump] = useAtom($stroe.router_jump);

    const [url_type, set_url_type] = useState('get');
    const [url, set_url] = useState('');
    const [local_download_path, set_local_download_path] = useState(undefined);

    const [form_data_list, set_form_data_list] = useState([] as HttpFormData[]);
    const [download_list, set_download_list] = useState<http_download_map[]>([]);

    const [mainTabKey, setMainTabKey] = useState("headers"); // "headers" | "body"
    const [bodyTabKey, setBodyTabKey] = useState<string>(String(http_body_type.row)); // 使用枚举值

    // 🌟 关键修改：将响应结果的 Tab Key 统一使用字符串管理
    const [responseTabKey, setResponseTabKey] = useState("body"); // "body" | "headers"

    const [status_code, set_status_code] = useState();
    const [nav_index_add_item_by_now_list, set_nav_index_add_item_by_now_list] = useAtom($stroe.nav_index_add_item_by_now_list);
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);

    editor_data.set_value_temp("{}", 0);
    editor_data.set_value_temp("", 1);

    useEffect(() => {
        http_header_value = {};
        http_body_value = "";
        respone_body = "";
        respone_headers = "";

        editor_data.get_editor(0).session.setMode('ace/mode/json');
        if (router_jump.http_download_map_path) {
            set_local_download_path(router_jump.http_download_map_path)
            set_router_jump({});
        }
        ws.sendData(CmdType.http_download_water, undefined).then(() => {
            ws.addMsg(CmdType.http_download_water, (wsData: WsData<http_download_map[]>) => {
                const list: http_download_map[] = wsData.context;
                set_download_list(list);
            })
        });

        return () => {
            if (ws && typeof ws.removeMsg === 'function') {
                ws.removeMsg(CmdType.http_download_water);
            }
        };
    }, []);

    const getItems = async () => {
        const result = await netHttp.get("http/tag");
        if (result.code === RCode.Success) return result.data;
        return [];
    }

    const saveItems = async (items) => {
        const rsq = await netHttp.post("http/tag/save", items);
        if (rsq.code !== RCode.Success) {
            NotyFail('网络错误');
        }
    }

    const clickItem = async (item: { url?: string, name?: string } & HttpFormPojo) => {
        set_url(item.url);
        set_url_type(item.method);
        set_local_download_path(item.local_download_path)

        if (item.header_type) {
            setMainTabKey(item.header_type === 1 ? "headers" : "body");
        }
        if (item.headers) {
            http_header_value = JSON.parse(item.headers);
            if (item.header_type === 1) {
                editor_data.get_editor(0).setValue(item.headers, -1);
                editor_data.get_editor(0).session.setMode('ace/mode/json');
            }
        }
        if (item.form_data_list)
            set_form_data_list(JSON.parse(item.form_data_list as string))
        if (item.data)
            http_body_value = item.data;

        if (item.body_type) {
            setBodyTabKey(String(item.body_type));

            if (item.body_type === http_body_type.row) {
                editor_data.get_editor(1).session.setMode('ace/mode/text');
            } else if (item.body_type === http_body_type.json) {
                editor_data.get_editor(1).session.setMode('ace/mode/json');
            }
            editor_data.get_editor(1).setValue(item.data, -1);
        }
    }

    const handleBodyTabChange = (key: string) => {
        setBodyTabKey(key);
        const numericKey = Number(key);

        if (numericKey === http_body_type.row) {
            editor_data.get_editor(1).session.setMode('ace/mode/text');
        } else if (numericKey === http_body_type.json) {
            editor_data.get_editor(1).session.setMode('ace/mode/json');
        }
    };

    // 🌟 关键修改：响应结果 Tab 切换回调函数
    const handleResponseTabChange = (key: string) => {
        setResponseTabKey(key);
        const content = key === "body" ? respone_body : respone_headers;
        set_status_body(content);

        const editor = editor_data.get_editor(2);
        if (editor) {
            try {
                JSON.parse(content);
                editor.session.setMode('ace/mode/json');
            } catch {
                editor.session.setMode('ace/mode/text');
            }
            editor.setValue(content, -1);
        }
    };

    const add = () => { set_form_data_list([{}, ...form_data_list]); }
    const del = (index) => {
        form_data_list.splice(index, 1);
        set_form_data_list([...form_data_list]);
    }

    const get_send_pojo = (formData?: any) => {
        const pojo = new HttpFormPojo();
        pojo.url = url;
        pojo.method = url_type;

        pojo.header_type = mainTabKey === "headers" ? 1 : 2;
        if (mainTabKey === "headers") {
            http_header_value = JSON.parse(editor_data.get_editor_value(0));
        }
        pojo.headers = http_header_value;

        const currentBodyType = Number(bodyTabKey) as http_body_type;
        pojo.body_type = currentBodyType;

        if (currentBodyType === http_body_type.row) {
            http_body_value = editor_data.get_editor_value(1);
            pojo.data = http_body_value;
        } else if (currentBodyType === http_body_type.json) {
            http_header_value['Content-Type'] = 'application/json';
            http_body_value = editor_data.get_editor_value(1);
            pojo.data = http_body_value;
        } else if (currentBodyType === http_body_type.form) {
            http_header_value['Content-Type'] = 'multipart/form-data';
            pojo.form_data_list = form_data_list;
            for (const item of form_data_list) {
                if (item.key && item.is_file && formData) {
                    formData.append(item.fullPath, item.file_object);
                }
            }
        }
        return pojo;
    }

    const send = async () => {
        if (!netHttp.have_http_method(url_type)) { NotyFail('不存在的http method'); return; }
        if (!url) { NotyFail('url is empty'); return; }
        set_status_code(undefined);
        set_status_body('');
        const formData = new FormData();
        formData.append('data', JSON.stringify(get_send_pojo(formData)));
        let target = `http/send`;
        if (local_download_path) target += `?local_download_path=${local_download_path}`;

        axios.post(netHttp.getUrl(target), formData, {
            headers: { 'Content-Type': 'multipart/form-data', 'Authorization': localStorage.getItem('token') }
        }).catch(e => { NotyFail(e.message); }).then((r: AxiosResponse) => {
            if (!r) return;

            // 1. 处理响应头对象 (确保 respone_headers 变成 JSON 对象用于判断)
            let headersObj: any = {};
            try {
                if (r.headers.filecat_remote_raw_headers) {
                    headersObj = JSON.parse(r.headers.filecat_remote_raw_headers);
                    respone_headers = JSON.stringify(headersObj, null, 2);
                }
                if (r.headers.filecat_remote_code) {
                    try {
                        const status = JSON.parse(r.headers.filecat_remote_code);
                        if (status === 200 || status === 201) {
                            set_status_code((<span style={{color: 'green'}}>200</span>));
                        } else {
                            set_status_code(status);
                        }
                    } catch (e) {
                        console.log(e)
                    }
                }
            } catch (e) {
                respone_headers = String(r.headers.filecat_remote_raw_headers);
            }

            // 2. 从 headersObj 中获取 Content-Type
            // 注意：HTTP 头是大小写不敏感的，但解析后的 JSON 键通常是小写或原始形式
            const contentType = (headersObj['content-type'] || headersObj['Content-Type'] || '').toLowerCase();

            // 3. 处理响应体
            respone_body = typeof r.data === 'object' ? JSON.stringify(r.data, null, 2) : r.data;

            // 4. Ace 编辑器智能切换
            const editor = editor_data.get_editor(2);
            const content = responseTabKey === "body" ? respone_body : respone_headers;

            if (editor) {
                // 匹配逻辑
                if (contentType.includes('application/json') || contentType.includes('+json')) {
                    editor.session.setMode('ace/mode/json');
                    // 自动格式化响应体
                    try {
                        const parsed = JSON.parse(respone_body);
                        respone_body = JSON.stringify(parsed, null, 2);
                    } catch(e) {}
                } else if (contentType.includes('html')) {
                    editor.session.setMode('ace/mode/html');
                } else if (contentType.includes('xml')) {
                    editor.session.setMode('ace/mode/xml');
                } else if (contentType.includes('javascript')) {
                    editor.session.setMode('ace/mode/javascript');
                } else {
                    editor.session.setMode('ace/mode/text');
                }

                // 同步内容
                editor.setValue(responseTabKey === "body" ? respone_body : respone_headers, -1);
            }

            set_status_body(content);
            // ... (状态码处理保持不变)
        });
    }

    const uploadFile = (index) => {
        setShowPrompt({
            show: true, type: PromptEnum.UploadFile, overlay: true, data: {
                extra_data: { only_file: true },
                call: (event) => {
                    let files = (event.currentTarget as HTMLInputElement)?.files;
                    if (!files) return;
                    const file = files[0];
                    file['fullPath'] = generateRandomHash() + Date.now().toString();
                    form_data_list[index].value = `${file}(${file.name})`;
                    form_data_list[index].is_file = true;
                    form_data_list[index].fileName = file.name;
                    form_data_list[index].fullPath = file['fullPath'];
                    set_form_data_list([...form_data_list]);
                    form_data_list[index].file_object = file;
                    setShowPrompt({ overlay: false, type: "", show: false, data: {} })
                }
            }
        });
    }

    const save_as = () => {
        if (!check_user_auth(UserAuth.http_proxy_tag_update)) { NotyFail("no permission"); return; }
        for (const item of form_data_list) {
            if (item.is_file) { NotyFail(t('表单中含有文件，浏览器限制不能添加')); return; }
        }
        let name;
        set_prompt_card({
            open: true, title: t("信息"), context_div: (
                <div>
                    <div className="card-content">
                        <InputText placeholderOut={t("输入标签名")} handleInputChange={(value) => name = value} />
                    </div>
                    <div className="card-action">
                        <button className="button button--flat" onClick={async () => {
                            const pojo = await get_send_pojo();
                            pojo.local_download_path = local_download_path;
                            pojo.form_data_list = JSON.stringify(form_data_list);
                            pojo.headers = JSON.stringify(pojo.headers);
                            if (typeof pojo.data === 'object') pojo.data = JSON.stringify(pojo.data);
                            pojo['name'] = name;
                            set_nav_index_add_item_by_now_list(pojo)
                            set_prompt_card({ open: false });
                        }}>{t("确定")}</button>
                    </div>
                </div>
            )
        })
    }

    function formatHeaders() {
        editor_data.get_editor(0)?.['formatCode']?.();
    }

    function formatBody() {
        editor_data.get_editor(1)?.['formatCode']?.();
    }

    return (<div>
        <Dashboard>
            <Header />
            <Row>
                <Column>
                    {/* 下载列表保持原样... */}
                    {download_list.length !== 0 && <Card title={"正在下载"}>
                        <div>
                            {download_list.map((value, index) => (
                                <div key={index}>
                                    <div className={"div-row"}>
                                        <ActionButton icon={"cancel"} title={t("取消")} onClick={() => {
                                            ws.sendData(CmdType.http_download_cancel, value.local_download_path)
                                        }} />
                                        <TextTip context={value.filename} tip_context={value.local_download_path} />
                                        <span style={{ paddingLeft: ".3rem", color: "green" }}>
                                            {`${(value.progresses ?? 0)}%  ${value.loaded ? formatFileSize(value.loaded) : ""}MB / ${value.seep ?? ""}MB/s  `}
                                        </span>
                                    </div>
                                    <div style={{ width: value.progresses ? `${value.progresses}%` : "0", backgroundColor: "#40c4ff", height: "5px", transition: "0.2s ease width", borderRadius: "10px" }}></div>
                                </div>
                            ))}
                        </div>
                    </Card>}

                    {/* 核心请求包裹器 */}
                    <Card title={""} rightBottomCom={Number(bodyTabKey) === http_body_type.form && mainTabKey === 'body' && <ActionButton icon={"add"} title={t("添加")} onClick={add} />}>
                        <div className={'http_url'}>
                            <Select width={'23rem'} value={url_type} onChange={(value) => { set_url_type(value) }} options={[
                                { value: 'get', color: '#28a745' },
                                { value: 'post', color: '#007bff' },
                                { value: 'put', color: '#fd7e14' },
                                { value: 'delete', color: '#dc3545' },
                                { value: 'head', color: '#6f42c1' },
                                { value: 'options', color: '#17a2b8' },
                                { value: 'connect', color: '#666666' },
                                { value: 'trace', color: '#666666' },
                                { value: 'custom', color: '#e83e8c' }
                            ]} />
                            <InputText width={'50rem'} placeholder={t("http url")} value={url} handleInputChange={(v) => { set_url(v); }} />
                            <ActionButton icon={"send"} title={t("发送")} onClick={send} />
                            {check_user_auth(UserAuth.http_proxy_tag_update) && <ActionButton title={t("添加")} icon={"save_as"} onClick={save_as} />}
                        </div>

                        <Tabs activeKey={mainTabKey} onChange={(key) => setMainTabKey(key)}>

                            {/* Panel 1: 请求头 */}
                            <TabPanel itemKey="headers" tab={t("请求头")+"(json)"}>
                                <div style={{ marginTop: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                                        <ActionButton title={t("格式化")} icon={"data_object"} onClick={formatHeaders} />
                                    </div>
                                    <div className={'http_ace'}>
                                        <Ace name={''} editor_id={0} />
                                    </div>
                                </div>
                            </TabPanel>

                            {/* Panel 2: 请求体 */}
                            <TabPanel itemKey="body" tab={t("请求体")}>
                                <div style={{ marginTop: '10px' }}>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Tabs activeKey={bodyTabKey} onChange={handleBodyTabChange}>
                                            <TabPanel itemKey={String(http_body_type.row)} tab={t("row")} />
                                            <TabPanel itemKey={String(http_body_type.json)} tab={t("json")} />
                                            <TabPanel itemKey={String(http_body_type.form)} tab={t("form")} />
                                        </Tabs>

                                        {Number(bodyTabKey) !== http_body_type.form && (
                                            <ActionButton title={t("格式化")} icon={"data_object"} onClick={formatBody} />
                                        )}
                                    </div>

                                    {Number(bodyTabKey) === http_body_type.form && (
                                        <div style={{ marginTop: '10px' }}>
                                            <Table headers={['key', t("值")]} rows={form_data_list.map((item, index) => [
                                                <InputText value={item['key']} handleInputChange={(value) => {
                                                    item['key'] = value;
                                                    set_form_data_list([...form_data_list]);
                                                }} no_border={true} />,
                                                <InputText value={item['value']} handleInputChange={(value) => {
                                                    item['value'] = value;
                                                    item['is_file'] = false;
                                                    set_form_data_list([...form_data_list]);
                                                }} no_border={true} />,
                                                <div>
                                                    <ActionButton icon={"file_upload"} title={t("上传文件")} onClick={() => uploadFile(index)} />
                                                    <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)} />
                                                </div>
                                            ])} width={"10rem"} />
                                        </div>
                                    )}

                                    <div className={'http_ace'} style={{
                                        marginTop: '10px',
                                        display: Number(bodyTabKey) !== http_body_type.form ? 'block' : 'none'
                                    }}>
                                        <Ace name={''} editor_id={1} />
                                    </div>

                                </div>
                            </TabPanel>
                        </Tabs>

                        <div style={{ paddingTop: "1rem" }}>
                            {local_download_path === undefined ? <span style={{ cursor: 'pointer', color: '#3b82f6' }} onClick={() => { set_local_download_path("") }}>{t("下载到本地目录")}</span> :
                                <InputText placeholder={t("本地地址")} value={local_download_path} handleInputChange={(v) => { set_local_download_path(v); }} handlerEnter={() => { if (!local_download_path) { set_local_download_path(undefined); } }} />}
                        </div>
                    </Card>


                </Column>
                <Column>

                    <Card title={status_code} titleCom={
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            {/* 响应体专用格式化按钮 */}
                            <ActionButton title={t("格式化")} icon={"data_object"} onClick={() => {
                                editor_data.get_editor(2)?.['formatCode']?.();
                            }} />
                            <ActionButton title={t("复制")} icon={"copy_all"} onClick={() => {
                                const val = editor_data.get_editor_value(2);
                                if (val) { copyToClipboard(val); NotySuccess("完成"); }
                            }} />
                        </div>
                    }>
                        <Tabs activeKey={responseTabKey} onChange={handleResponseTabChange}>
                            <TabPanel itemKey="body" tab={t("响应体")} />
                            <TabPanel itemKey="headers" tab={t("响应头")} />
                        </Tabs>

                        <div className={'http_ace'} style={{ marginTop: '10px', height: '21rem' }}>
                            {/* 使用 editor_id={2} */}
                            <Ace name={''} editor_id={2} />
                        </div>
                    </Card>

                </Column>
            </Row>
            <Row>
                <Column>
                    <NavIndexContainer getItems={getItems} save={saveItems} have_auth_edit={check_user_auth(UserAuth.http_proxy_tag_update)} clickItem={clickItem} items={[{ key: "name", preName: t("名字") }, { key: "url", preName: "url" }, { key: "method", preName: "method" }, { key: "headers", preName: "headers" }, { key: "data", preName: "data" }, { key: "form_data_list", preName: "form_data_list" }, { key: "local_download_path", preName: "local_download_path" }, { key: "color", preName: "color" }]} />
                </Column>
            </Row>
        </Dashboard>
    </div>);
}