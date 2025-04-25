import {FileTypeEnum} from "../../../common/file.pojo";
import {getFileNameByLocation} from "../component/file/FileUtil";
import {fileHttp} from "./config";
import {NotyFail} from "./noty";
import {getEditModelType} from "../../../common/StringUtil";
import {getFileFormat} from "../../../common/FileMenuType";
import {getRouterAfter, getRouterPath} from "./WebPath";
import {RCode} from "../../../common/Result.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "./store";
import {saveTxtReq} from "../../../common/req/file.req";
import {useTranslation} from "react-i18next";
import {MAX_SIZE_TXT} from "../../../common/ValueUtil";
import {Ace as AceItem} from "ace-builds";
import {UserAuth} from "../../../common/req/user.req";
import {useEffect} from "react";

async function get_file_context(path, is_sys_path) {
    if (is_sys_path) {
        path += "?is_sys_path=1"
    }
    const rsq = await fileHttp.get(path);
    if (rsq.code === RCode.Sucess) {
        NotyFail("超过20MB");
        return;
    }
    return rsq.data;
}

export const user_click_file = () => {
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting);
    const [file_preview, setFilePreview] = useRecoilState($stroe.file_preview)
    const [markdown, set_markdown] = useRecoilState($stroe.markdown)
    const [excalidraw_editor, set_excalidraw_editor] = useRecoilState($stroe.excalidraw_editor);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);

    const {t} = useTranslation();

    const click_file = async (param: {
        name,
        size?: number,
        ignore_size?: boolean,
        context?: string,
        model?: string,
        sys_path?: string,
        menu_list?: any[],
        opt_shell?: boolean,
        mtime?: any,
    }) => {
        if (!param.ignore_size && typeof param.size === "number" && param.size > MAX_SIZE_TXT) {
            setShowPrompt({
                open: true,
                title: "提示",
                sub_title: `文件超过20MB了确定要打开吗?`,
                handle: async () => {
                    setShowPrompt({open: false, handle: null});
                    param.ignore_size = true;
                    click_file(param);
                }
            })
            return;
        }
        const {name, context} = param;
        let model = getEditModelType(name);
        const type = getFileFormat(name);
        if (param.model === "text") {
            // 双击文件
            let value;
            if (context) {
                value = context;
            } else {
                value = await get_file_context(param.sys_path ?? `${encodeURIComponent(getRouterAfter('file', getRouterPath()))}${name}`, !!param.sys_path);
                // if (!value) {
                //     return;
                // }
            }
            // if (!model) {
            //     model = "text";
            // }
            let m = undefined;
            if(type === FileTypeEnum.workflow_act){
                m = "ace/mode/yaml"
            } else if(type === FileTypeEnum.draw || type === FileTypeEnum.excalidraw){
                m = "ace/mode/json"
            }
            setEditorSetting({
                menu_list: param.menu_list,
                model:m,
                open: true,
                fileName: name,
                save: async (context) => {
                    const data: saveTxtReq = {
                        context
                    }
                    const v = encodeURIComponent(getRouterAfter('file', getRouterPath()));
                    const rsq = await fileHttp.post(`save/${param.sys_path ?? `${v}${name}`}?is_sys_path=${param.sys_path ? 1 : 0}`, data)
                    if (rsq.code === 0) {
                        editor_data.set_value_temp('')
                        // setEditorSetting({open: false, model: '', fileName: '', save: null})
                    }
                },
                opt_shell:param.opt_shell
            })
            editor_data.set_value_temp(value)
            return;
        } else {
            let url = fileHttp.getDownloadUrl(getFileNameByLocation(name));
            switch (type) {
                case FileTypeEnum.draw:
                case FileTypeEnum.excalidraw:
                    set_excalidraw_editor({path: "", name});
                    break;
                case FileTypeEnum.md:
                    set_markdown({
                        context: await get_file_context(`${encodeURIComponent(getRouterAfter('file', getRouterPath()))}${name}`, false),
                        filename: name
                    })
                    break;
                case FileTypeEnum.video:
                case FileTypeEnum.pdf:
                    setFilePreview({open: true, type: type, name, url})
                    break;
                case FileTypeEnum.image:
                    setFilePreview({open: true, type: type, name, url:fileHttp.getDownloadUrl(getFileNameByLocation(name),{mtime:param.mtime,cache:1})})
                    break;
                case FileTypeEnum.workflow_act:
                    param.model = "text";
                    click_file(param);
                    break;
                case FileTypeEnum.unknow:
                default:
                    if (model) {
                        param.model = "text";
                        click_file(param);
                        break;
                    }
                    NotyFail(t("未知类型、请右键点击文件"))
                    break;
            }

        }

    }

    return {click_file};
}
export const auth_key_map = new Map() // 更新的时候清空一下
export const use_auth_check = () => {
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);

    const check_user_auth = (auth: UserAuth) => {
        const v = auth_key_map.get(auth);
        if(v !== undefined) {
            return v;
        }
        if(user_base_info?.user_data?.is_root) return true;
        for (const v of (user_base_info.user_data?.auth_list ?? [])) {
            if (v === auth) {
                auth_key_map.set(auth, true);
                return true;
            }

        }
        auth_key_map.set(auth, false);
        return false;
    }

    return {check_user_auth};
}

export const use_file_to_running = () => {
    const [to_running_files_set, set_to_runing_files_set] = useRecoilState($stroe.to_running_files);
        // useEffect(()=>{
        //     // console.log(to_runing_files_set)
        // },[to_running_files_set])
    const file_is_running = (filename: string) => {
        return to_running_files_set.has(filename);
    }

    return {file_is_running};
}

export class editor_data {

    static cache_str_map: Map<number,string> = new Map();
    static editor_map: Map<number,AceItem.Editor>  = new Map();

    //  设置临时值 用于全局传递
    public static set_value_temp(v: string,editor_id?:number) {
        editor_data.cache_str_map.set(editor_id===undefined?0:editor_id, v)
    }

    public static get_value_temp(editor_id?:number) {
        return editor_data.cache_str_map.get(editor_id===undefined?0:editor_id);
    }

    public static set_editor_temp(v: AceItem.Editor ,editor_id?:number) {
        editor_data.editor_map.set(editor_id===undefined?0:editor_id, v);
    }

    public static delete_editor_temp(editor_id?:number) {
        editor_data.editor_map.delete(editor_id===undefined?0:editor_id);
    }

    public static get_editor_value(editor_id?:number) {
        // if (!editor_data.editor_map.has(editor_id)) {
        //     throw "不存在编辑器";
        // }
        return editor_data.editor_map.get(editor_id===undefined?0:editor_id).getValue();
    }

    public static get_editor(editor_id?:number) {
        return this.editor_map.get(editor_id===undefined?0:editor_id);
    }

    // public static set_value(v: string, filename?: string) {
    //     if (filename) {
    //         localStorage.setItem(filename, v);
    //     } else {
    //         localStorage.setItem("cache_str", v);
    //     }
    // }

    // public static get_value(filename?: string) {
    //     if (filename) {
    //         localStorage.getItem(filename);
    //     } else {
    //         localStorage.getItem("cache_str");
    //     }
    // }

    // public static delete_value(filename?: string) {
    //     if (filename) {
    //         localStorage.removeItem(filename);
    //     } else {
    //         localStorage.removeItem("cache_str");
    //     }
    // }
}


// 将 Base64 数据分成多个片段
export function createChunks(base64Str, size) {
    const chunks = [];
    let index = 0;

    while (index < base64Str.length) {
        chunks.push(base64Str.slice(index, index + size));
        index += size;
    }

    return chunks;
}
