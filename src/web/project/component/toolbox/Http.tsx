import React, {useEffect, useState} from 'react'

import {NavIndexContainer} from "../navindex/component/NavIndexContainer";
import {Column, Dashboard, Row} from "../../../meta/component/Dashboard";
import {ActionButton} from "../../../meta/component/Button";
import {InputRadio, InputText, InputTextIcon} from "../../../meta/component/Input";
import Header from "../../../meta/component/Header";
import {useTranslation} from "react-i18next";
import {Rows, Table} from "../../../meta/component/Table";
import {Card, TextTip} from "../../../meta/component/Card";
import {netHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {NotyFail, NotySucess} from "../../util/noty";
import {copyToClipboard} from "../../util/FunUtil";
import Noty from "noty";
import Ace from "../file/component/Ace";
import {editor_data, use_auth_check} from "../../util/store.util";
import {http_body_type, http_download_map, HttpFormData, HttpFormPojo} from "../../../../common/req/net.pojo";
import {PromptEnum} from "../prompts/Prompt";
import {generateRandomHash} from "../../../../common/StringUtil";
import axios, {AxiosResponse} from "axios";
import {UserAuth} from "../../../../common/req/user.req";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import { formatFileSize } from '../../../../common/ValueUtil';

let http_header_value;
let http_json_value;
let http_row_value;

let respone_body;
let respone_headers;

export function Http() {

    const {t, i18n} = useTranslation();
    const [confirm, set_confirm] = useRecoilState($stroe.confirm);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const {check_user_auth} = use_auth_check();

    const [status_body, set_status_body] = useState('');
    const [router_jump, set_router_jump] = useRecoilState($stroe.router_jump);


    const [url_type, set_url_type] = useState('get');
    const [url, set_url] = useState('');
    const [local_download_path, set_local_download_path] = useState(undefined);

    const [form_data_list, set_form_data_list] = useState([] as HttpFormData[]);
    const [download_list,set_download_list] = useState<http_download_map[]>([]);

    const [header_or_body_type, set_header_or_body_type] = useState(1); // 1 请求头 2 请求体
    const [body_type, set_body_type] = useState(1); // 2 是json 3 是 form 表单 1 是 row
    const [respone_type, set_respone_type] = useState(1); // 1 是响应体 2 是响应头

    const [status_code, set_status_code] = useState();

    const [nav_index_add_item_by_now_list, set_nav_index_add_item_by_now_list] = useRecoilState($stroe.nav_index_add_item_by_now_list);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    editor_data.set_value_temp("{}");

    useEffect(() => {
        http_header_value = {};
        http_json_value = {};
        http_row_value = "";
        respone_body = "";
        respone_headers = "";
        editor_data.get_editor().session.setMode('ace/mode/json');
        if(router_jump.http_download_map_path) {
            set_local_download_path(router_jump.http_download_map_path)
            set_router_jump({});
        }
        ws.sendData(CmdType.http_download_water,undefined).then(()=>{

            ws.addMsg(CmdType.http_download_water, (wsData:WsData<http_download_map[]>)=>{
                const list:http_download_map[] = wsData.context;
                set_download_list(list);
                console.log(list)
            })
        });

        return ()=>{
            ws.unConnect();
        }
    }, []);
    const getItems = async () => {
        const result = await netHttp.get("http/tag");
        if (result.code === RCode.Sucess) {
            return result.data;
        }
        return [];
    }
    const saveItems = async (items) => {
        const rsq = await netHttp.post("http/tag/save", items);
        if (rsq.code !== RCode.Sucess) {
            new Noty({
                type: 'error',
                text: '网络错误',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout: "bottomLeft"
            }).show();
        }
    }
    const clickItem = async (item: { url?: string, name?: string } & HttpFormPojo) => {
        set_url(item.url);
        set_url_type(item.method);
        set_local_download_path(item.local_download_path)
        if (item.header_type) {
            switch_header_type(item.header_type)
        }
        if (item.headers) {
            http_header_value = JSON.parse(item.headers);
            if (item.header_type === 1) {
                editor_data.get_editor().setValue(item.headers, -1);
                editor_data.get_editor().session.setMode('ace/mode/json');
            }
        }
        if(item.form_data_list )
            set_form_data_list(JSON.parse(item.form_data_list as string))
        if (item.json_data)
            http_json_value = JSON.parse(item.json_data);
        if(item.data)
            http_row_value = item.data;
        if (item.body_type) {
            set_body_type(item.body_type);
            if (item.header_type === 2) {
                if (item.body_type === 1) {
                    editor_data.get_editor().setValue(http_row_value, -1)
                    editor_data.get_editor().session.setMode('ace/mode/text')
                } else if (item.body_type === 2) {
                    editor_data.get_editor().setValue(JSON.stringify(http_json_value, null, 2), -1)
                    editor_data.get_editor().session.setMode('ace/mode/json')
                }
            }

        }
    }
    const switch_header_type = (type) => {
        try {
            if (header_or_body_type === 1) {
                http_header_value = JSON.parse(editor_data.get_editor_value());
            } else if (header_or_body_type === 2) {
                if (body_type === 1) {
                    http_row_value = editor_data.get_editor_value();
                } else if (body_type === 2) {
                    http_json_value = JSON.parse(editor_data.get_editor_value());
                }
            }
        } catch (e) {
            NotyFail(e.message);
        }

        set_header_or_body_type(type);

        // 还原之前的值
        if (type === 1) {
            editor_data.get_editor().setValue(JSON.stringify(http_header_value, null, 2), -1)
            editor_data.get_editor().session.setMode('ace/mode/json')
        } else if (type === 2) {
            // 还原 body 之前的值
            if (body_type === 1) {
                editor_data.get_editor().setValue(http_row_value, -1)
                editor_data.get_editor().session.setMode('ace/mode/text')
            } else if (body_type === 2) {
                editor_data.get_editor().setValue(JSON.stringify(http_json_value, null, 2), -1)
                editor_data.get_editor().session.setMode('ace/mode/json')
            }
        }
    }
    const switch_type = (type) => {
        if (header_or_body_type !== 2) {
            return;
        }
        const value = editor_data.get_editor_value();
        // 保留之前的值
        if (value) {
            try {
                if (body_type === 1) {
                    http_row_value = editor_data.get_editor_value();
                } else if (body_type === 2) {
                    http_json_value = JSON.parse(editor_data.get_editor_value());
                }
            } catch (e) {
                NotyFail(e.message);
                return;
            }
        }

        set_body_type(type);

        // 还原之前的值
        if (type === 1) {
            editor_data.get_editor().setValue(http_row_value, -1)
            editor_data.get_editor().session.setMode('ace/mode/text')
        } else if (type === 2) {
            editor_data.get_editor().setValue(JSON.stringify(http_json_value, null, 2), -1)
            editor_data.get_editor().session.setMode('ace/mode/json')
        }
    }
    const add = () => {
        set_form_data_list([{}, ...form_data_list]);
    }
    const del = (index) => {
        form_data_list.splice(index, 1);
        set_form_data_list([...form_data_list]);
    }

    const get_send_pojo = (formData?: any) => {
        const pojo = new HttpFormPojo();
        pojo.url = url;
        pojo.method = url_type;
        if (header_or_body_type === 1) {
            http_header_value = JSON.parse(editor_data.get_editor_value());
        }
        pojo.headers = http_header_value;
        pojo.body_type = body_type;
        pojo.header_type = header_or_body_type;
        if (body_type === http_body_type.row) {
            if (header_or_body_type === 2) {
                http_row_value = editor_data.get_editor_value();
            }
            pojo.data = http_row_value;
            pojo.json_data = JSON.stringify(http_json_value);
        } else if (body_type === http_body_type.json) {
            http_header_value['Content-Type'] = 'application/json';
            if (header_or_body_type === 1)
                editor_data.get_editor().setValue(JSON.stringify(http_header_value), -1)
            if (header_or_body_type === 2) {
                http_json_value = JSON.parse(editor_data.get_editor_value());
            }
            pojo.json_data = JSON.stringify(http_json_value);
            pojo.data = http_row_value;
        } else if (body_type === http_body_type.form) {
            // 表单 非 application/x-www-form-urlencoded
            http_header_value['Content-Type'] = 'multipart/form-data';
            pojo.form_data_list = form_data_list;
            for (const item of form_data_list) {
                if (item.key) {
                    if (item.is_file && formData) {
                        formData.append(item.fullPath, item.file_object);
                    }
                }
            }
        }
        return pojo;
    }
    const send = async () => {
        if (!netHttp.have_http_method(url_type)) {
            NotyFail('不存在的http method');
            return;
        } // 对于文件将文件的key转一下，发送的所有的key都和用户没有关系
        if (!url) {
            NotyFail('url is empty');
            return;
        }
        set_status_code(undefined);
        set_status_body('');
        const formData = new FormData();
        formData.append('data', JSON.stringify(get_send_pojo(formData)));
        let target = `http/send`;
        if(local_download_path) {
            target+=`?local_download_path=${local_download_path}`
        }
        axios.post(netHttp.getUrl(target), formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': localStorage.getItem('token')
                }
            }).catch(e => {
            NotyFail(e.message);
        }).then((r: AxiosResponse) => {
            if (!r) return;
            // debugger
            if (r.headers.filecat_remote_code) {
                try {
                    const status = JSON.parse(r.headers.filecat_remote_code);
                    if (status === 200) {
                        set_status_code((<span style={{color: 'green'}}>200</span>));
                    } else {
                        set_status_code(status);
                    }
                } catch (e) {
                    console.log(e)
                }
            }
            // console.log(r.headers.filecat_remote_raw_headers)
            if (typeof r.data === 'object') {
                respone_body = JSON.stringify(r.data);
            } else {
                respone_body = r.data;
            }
            try {
                if(r.headers.filecat_remote_raw_headers)
                respone_headers = JSON.stringify(JSON.parse(r.headers.filecat_remote_raw_headers),null,2);
            } catch (e) {
                respone_headers = JSON.stringify(r.headers.filecat_remote_raw_headers);
            }
            if (respone_type === 1) {
                set_status_body(respone_body);
            } else if (respone_type === 2) {
                set_status_body(respone_headers);
            }
        });
    }
    const uploadFile = (index) => {
        setShowPrompt({
            show: true, type: PromptEnum.UploadFile, overlay: true, data: {
                extra_data: {only_file: true},
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
                    setShowPrompt({overlay: false, type: "", show: false, data: {}})
                }
            }
        });
    }
    const get_pre_add_item = async () => {
        const pojo = get_send_pojo();
        pojo.local_download_path = local_download_path;
        if (form_data_list) {
            for (const item of form_data_list) {
                if (item.is_file) {
                    item.file_object = undefined;
                }
            }
        }
        pojo.form_data_list = JSON.stringify(form_data_list);
        pojo.headers = JSON.stringify(pojo.headers);
        if (typeof pojo.data === 'object') {
            pojo.data = JSON.stringify(pojo.data);
        }
        return pojo;
    }
    const save_as = () => {
        if(!check_user_auth(UserAuth.http_proxy_tag_update)) {
            NotyFail("no permission")
            return;
        }
        for (const item of form_data_list) {
            if (item.is_file) {
                NotyFail('表单中含有文件，浏览器限制不能添加');
                return;
            }
        }
        let name;
        set_prompt_card({
            open: true, title: "信息", context_div: (
                <div>
                    <div className="card-content">
                        <InputText placeholderOut={t("输入标签名")}
                                   handleInputChange={(value) => name = value}/>
                    </div>
                    <div className="card-action">
                        <button className="button button--flat" onClick={async () => {
                            const pojo = await get_pre_add_item();
                            pojo['name'] = name;
                            set_nav_index_add_item_by_now_list(pojo)
                            set_prompt_card({open: false});
                        }}>
                            {"确定"}
                        </button>
                    </div>
                </div>
            )
        })

    }
    return (<div>
        <Dashboard>
            <Header>

            </Header>
            <Row>
                <Column>
                    {
                        download_list.length!==0 && <Card title={"正在下载"}>
                            <div>
                                {download_list.map((value, index) => {
                                    return (<div  key={index}>
                                        <div className={"div-row"}>
                                            <ActionButton icon={"cancel"} title={t("取消")} onClick={()=>{
                                                ws.sendData(CmdType.http_download_cancel, value.local_download_path)
                                            }}/>
                                            <TextTip context={value.filename} tip_context={value.local_download_path}/>
                                            <span style={{
                                                paddingLeft: ".3rem",
                                                color: "green"
                                            }}>
                                        {`${(value.progresses??0)}%  ${value.loaded?formatFileSize(value.loaded):""}MB / ${value.seep??""}MB/s  `}
                                    </span>
                                        </div>
                                        <div style={{
                                            width: value.progresses?`${value.progresses}%`:"0",
                                            backgroundColor: "#40c4ff",
                                            height: "5px",
                                            transition: "0.2s ease width",
                                            borderRadius: "10px",
                                        }}></div>
                                    </div>)
                                })}
                            </div>
                        </Card>
                    }
                    <Card title={""}
                          rightBottomCom={body_type === 3 && header_or_body_type === 2 &&
                              <ActionButton icon={"add"} title={t("添加")} onClick={add}/>}
                    >
                        <div className={'http_url'}>
                            <InputTextIcon max_width={'15%'} placeholder={t("协议")} icon={"http"} value={url_type}
                                           handleInputChange={(v) => {
                                               set_url_type(v);
                                           }}/>
                            <InputTextIcon max_width={'80%'} placeholder={t("http url")} icon={"link"} value={url}
                                           handleInputChange={(v) => {
                                               set_url(v);
                                           }}/>
                            <ActionButton icon={"send"} title={t("发送")} onClick={send}/>
                            {check_user_auth(UserAuth.http_proxy_tag_update) &&
                                <ActionButton title={"添加"} icon={"save_as"} onClick={save_as}/>}
                        </div>
                        <Rows isFlex={true} columns={[
                            <InputRadio value={1} name={'h_or_body'} context={t("请求头")}
                                        selected={header_or_body_type === 1} onchange={() => {
                                switch_header_type(1)
                            }}/>,
                            <InputRadio value={2} name={'h_or_body'} context={t("请求体")}
                                        selected={header_or_body_type === 2} onchange={() => {
                                switch_header_type(2)
                            }}/>,
                        ]}/>
                        <Rows isFlex={true} columns={[
                            <InputRadio value={1} name={'body'} context={t("row")} selected={body_type === 1}
                                        onchange={() => {
                                            switch_type(1)
                                        }}/>,
                            <InputRadio value={2} name={'body'} context={t("json")} selected={body_type === 2}
                                        onchange={() => {
                                            switch_type(2)
                                        }}/>,
                            <InputRadio value={3} name={'body'} context={t("form")} selected={body_type === 3}
                                        onchange={() => {
                                            switch_type(3)
                                        }}/>,
                        ]}/>
                        <div className={'http_ace'}
                             style={{display: body_type === 3 && header_or_body_type === 2 ? "none" : ''}}>
                            <Ace name={''}/>
                        </div>
                        <div style={{display: !(body_type === 3 && header_or_body_type === 2) ? "none" : ''}}>
                            <Table headers={['key', t("值")]} rows={form_data_list.map((item, index) => {
                                const new_list = [
                                    <InputText value={item['key']} handleInputChange={(value) => {
                                        item['key'] = value;
                                        set_form_data_list([...form_data_list]);
                                    }} no_border={true}/>,
                                    <InputText value={item['value']} handleInputChange={(value) => {
                                        item['value'] = value;
                                        item['is_file'] = false;
                                        set_form_data_list([...form_data_list]);
                                    }} no_border={true}/>,
                                    <div>
                                        <ActionButton icon={"file_upload"} title={t("上传文件")}
                                                      onClick={() => uploadFile(index)}/>
                                        <ActionButton icon={"delete"} title={t("删除")} onClick={() => del(index)}/>
                                    </div>
                                ];
                                return new_list;
                            })} width={"10rem"}/>
                        </div>
                        <div style={{paddingTop: "1rem"}}>
                            {local_download_path === undefined ? <span onClick={() => {
                                    set_local_download_path("")
                                }}>下载到本地目录</span> :
                                <InputText placeholder={t("本地地址")} value={local_download_path}
                                           handleInputChange={(v) => {
                                               set_local_download_path(v);
                                           }} handlerEnter={()=>{
                                               if(!local_download_path) {
                                                   set_local_download_path(undefined);
                                               }
                                }}/>}
                        </div>

                    </Card>
                    <Card title={status_code} titleCom={
                        <div className={" div-row "}>
                            <InputRadio value={1} name={'respone'} context={t("响应体")}
                                        selected={respone_type === 1} onchange={() => {
                                set_respone_type(1)
                                set_status_body(respone_body)
                            }}/>
                            <InputRadio value={1} name={'respone'} context={t("响应头")}
                                        selected={respone_type === 2} onchange={() => {
                                set_respone_type(2)
                                set_status_body(respone_headers)
                            }}/>
                            <ActionButton title={"复制"} icon={"copy_all"} onClick={() => {
                                if (status_body) {
                                    copyToClipboard(status_body);
                                    NotySucess("复制完成")
                                }
                            }}/>
                        </div>}
                    >
                        <textarea className={"input--textarea input--no_border"}
                                  style={{
                                      width: "100%",
                                      height: "270px",
                                  }}
                                  onChange={(event) => {
                                      set_status_body(event.target.value)
                                  }}
                                  value={status_body}
                        ></textarea>
                    </Card>
                </Column>
                <Column>
                    <NavIndexContainer getItems={getItems} save={saveItems}
                                       have_auth_edit={check_user_auth(UserAuth.http_proxy_tag_update)}
                                       clickItem={clickItem}
                                       items={[
                                           {key: "name", preName: t("名字")},
                                           {key: "url", preName: "url"},
                                           {key: "method", preName: "method"},
                                           {key: "headers", preName: "headers"},
                                           {key: "data", preName: "data"},
                                           {key: "form_data_list", preName: "form_data_list"},
                                           {key: "local_download_path", preName: "local_download_path"}
                                       ]}/>
                </Column>
            </Row>
        </Dashboard>
    </div>);
}