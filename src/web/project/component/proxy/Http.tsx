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
import { useRecoilState } from "recoil";
import { $stroe } from "../../util/store";
import { NotyFail, NotySucess } from "../../util/noty";
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
    const [confirm, set_confirm] = useRecoilState($stroe.confirm);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const { check_user_auth } = use_auth_check();

    const [status_body, set_status_body] = useState('');
    const [router_jump, set_router_jump] = useRecoilState($stroe.router_jump);

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
    const [nav_index_add_item_by_now_list, set_nav_index_add_item_by_now_list] = useRecoilState($stroe.nav_index_add_item_by_now_list);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

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
        set_status_body(key === "body" ? respone_body : respone_headers);
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
            if (r.headers.filecat_remote_code) {
                try {
                    const status = JSON.parse(r.headers.filecat_remote_code);
                    set_status_code(status === 200 ? (<span style={{ color: 'green' }}>200</span>) : status);
                } catch (e) { console.log(e) }
            }
            respone_body = typeof r.data === 'object' ? JSON.stringify(r.data) : r.data;
            try {
                if (r.headers.filecat_remote_raw_headers)
                    respone_headers = JSON.stringify(JSON.parse(r.headers.filecat_remote_raw_headers), null, 2);
            } catch (e) { respone_headers = JSON.stringify(r.headers.filecat_remote_raw_headers); }

            // 🌟 发送完成后，根据当前用户所处的 Tab 状态回填对应的数据
            set_status_body(responseTabKey === "body" ? respone_body : respone_headers);
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
                            <Select width={'10rem'} value={url_type} onChange={(value) => { set_url_type(value) }} options={[{ value: 'get' }, { value: 'post' }, { value: 'put' }, { value: 'delete' }, { value: 'head' }, { value: 'options' }, { value: 'connect' }, { value: 'trace' }, { value: 'custom' }]} />
                            <InputText width={'50rem'} placeholder={t("http url")} value={url} handleInputChange={(v) => { set_url(v); }} />
                            <ActionButton icon={"send"} title={t("发送")} onClick={send} />
                            {check_user_auth(UserAuth.http_proxy_tag_update) && <ActionButton title={t("添加")} icon={"save_as"} onClick={save_as} />}
                        </div>

                        <Tabs activeKey={mainTabKey} onChange={(key) => setMainTabKey(key)}>

                            {/* Panel 1: 请求头 */}
                            <TabPanel itemKey="headers" tab={t("请求头")}>
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

                    {/* 🌟 核心修改：返回结果区域改用新 Tabs 组件，同时在头部右侧提供复制功能 */}
                    <Card title={status_code} titleCom={
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <ActionButton title={t("复制")} icon={"copy_all"} onClick={() => { if (status_body) { copyToClipboard(status_body); NotySucess("完成"); } }} />
                        </div>
                    }>
                        <Tabs activeKey={responseTabKey} onChange={handleResponseTabChange}>
                            <TabPanel itemKey="body" tab={t("响应体")} />
                            <TabPanel itemKey="headers" tab={t("响应头")} />
                        </Tabs>

                        <div style={{ marginTop: '10px' }}>
                            <textarea
                                className={"input--textarea input--no_border"}
                                style={{ width: "100%", height: "270px" }}
                                onChange={(event) => set_status_body(event.target.value)}
                                value={status_body}
                            />
                        </div>
                    </Card>
                </Column>
                <Column>
                    <NavIndexContainer getItems={getItems} save={saveItems} have_auth_edit={check_user_auth(UserAuth.http_proxy_tag_update)} clickItem={clickItem} items={[{ key: "name", preName: t("名字") }, { key: "url", preName: "url" }, { key: "method", preName: "method" }, { key: "headers", preName: "headers" }, { key: "data", preName: "data" }, { key: "form_data_list", preName: "form_data_list" }, { key: "local_download_path", preName: "local_download_path" }, { key: "color", preName: "color" }]} />
                </Column>
            </Row>
        </Dashboard>
    </div>);
}