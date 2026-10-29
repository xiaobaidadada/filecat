import React, {ReactNode, useEffect, useRef, useState,useImperativeHandle} from 'react';
import {Ace as AceItem} from "ace-builds";
// 静态 mode/theme 引入 + CDN 兜底配置统一放在 ace_setup，
// 与 AceCodeEditor 共用同一份，避免两处各写一套导致行为不一致（见该文件的说明）。
import {ace, modest} from "../../../../meta/component/ace_setup";
import { useAtom } from 'jotai';
import {$stroe} from "../../../util/store";
import {editor_data} from "../../../util/store.util";
import {use_editor_auto_save} from "../../../util/editor_auto_save";
import {EditorAutoSaveEnum} from "../../../../../common/req/user.req";
// import "ace-builds/src-noconflict/ext-language_tools";


// name 是用于获取 类型的方式
// save 传入后，本组件自己负责脏标记与自动保存（有保存入口的调用方都应传）；
// 不传的调用方（如代理页、SQL 编辑器）只是把 Ace 当输入框用，保持原来的受控行为。
// on_dirty 把未保存状态同步给调用方（如 Studio 据它决定是否拦截切换文件）。
// register 把保存能力交出去，供外层 Header 按钮和 Ctrl+S 调用，与其他编辑器的约定一致。
export interface AceApi {
    /** 保存（silent 为自动保存，失败不提示） */
    save: (silent?: boolean) => Promise<void>;
}

export default function Ace(props:{name: string,model?:string,on_change?:()=>void,options?: Partial<AceItem.EditorOptions>,editor_id?:number,save?:(silent?:boolean)=>any,on_dirty?:(dirty:boolean)=>void,register?:(api:AceApi)=>void}) {
    const editorRef = useRef(null);
    const [userInfo, setUserInfo] = useAtom($stroe.user_base_info);
    // 组件内部维护脏标记，保存成功后自行清掉，不再让调用方各自实现一遍
    const [have_update, set_have_update] = useState(false);
    const have_update_ref = useRef(have_update);
    have_update_ref.current = have_update;
    const save_ref = useRef(props.save);
    save_ref.current = props.save;
    const on_dirty_ref = useRef(props.on_dirty);
    on_dirty_ref.current = props.on_dirty;
    useEffect(() => {
        on_dirty_ref.current?.(have_update);
    }, [have_update]);
    // 保存成功后由编辑器自己清脏：调用方只管把内容写到该去的地方，不用再操心状态
    const save = async (silent?: boolean) => {
        if (!save_ref.current || !have_update_ref.current) {
            return;
        }
        const ok = await save_ref.current(silent);
        if (ok !== false) {
            set_have_update(false);
        }
    };
    const save_expose_ref = useRef(save);
    save_expose_ref.current = save;
    const register_ref = useRef(props.register);
    register_ref.current = props.register;
    useEffect(() => {
        register_ref.current?.({save: (silent?: boolean) => save_expose_ref.current(silent)});
    }, []);
    use_editor_auto_save(EditorAutoSaveEnum.ace,
        () => !!save_ref.current && have_update_ref.current,
        save);
    const theme = userInfo.user_data.theme?.includes("dark") ? "cloud_editor_dark" : "cloud9_day";
    useEffect(() => {
        const editor = ace.edit(editorRef.current, {
            value: editor_data.get_value_temp(props.editor_id),
            showPrintMargin: false,
            // readOnly: true,
            theme: `ace/theme/${theme}`,
            mode: props.model ?? modest.getModeForPath(props.name ?? '').mode,
            wrap: false,
            highlightActiveLine:false, // 鼠标放在一行上的高亮
            fontSize:14,
            // fontFamily:"JetBrains Mono"
            ...props.options,
        });
        // 语言智能提醒需要 import "ace-builds/src-noconflict/ext-language_tools";
        editor.setOptions({
            // enableBasicAutocompletion: true, // 语言的基本自动补全 需要按 table
            // enableSnippets: true, // 快速插入模板，会有提示 安装enter键入 fori这样的
            // enableLiveAutocompletion: true // 实时提醒
        });
        // 监听滚动事件
        editor.container.addEventListener("wheel", function (e) {
            e.preventDefault()
        })
        editor.focus();
        editor.on("change", function(e) {
            set_have_update(true);
            if(props.on_change) {
                props.on_change();
            }
        });
        editorRef.current = editor;
        editor['formatCode'] =  ()=> {
            const beautify = ace.require("ace/ext/beautify") as any;
            const editor = editorRef.current;
            if (editor) beautify.beautify(editor.session);
        }
        editor_data.set_editor_temp(editor,props.editor_id);

        return () => {
            editor_data.delete_editor_temp(props.editor_id);
            editor.destroy();
        };
    }, []);

    return <div ref={editorRef}  style={{ height: '100%', width: '100%' }} />
}
