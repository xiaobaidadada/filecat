import React, {ReactNode, useEffect, useRef, useState,useImperativeHandle} from 'react';
import {Ace as AceItem} from "ace-builds";
// 静态 mode/theme 引入 + CDN 兜底配置统一放在 ace_setup，
// 与 AceCodeEditor 共用同一份，避免两处各写一套导致行为不一致（见该文件的说明）。
import {ace, modest} from "../../../../meta/component/ace_setup";
import { useAtom } from 'jotai';
import {$stroe} from "../../../util/store";
import {editor_data} from "../../../util/store.util";
// import "ace-builds/src-noconflict/ext-language_tools";


// name 是用于获取 类型的方式
export default function Ace(props:{name: string,model?:string,on_change?:()=>void,options?: Partial<AceItem.EditorOptions>,editor_id?:number}) {
    const editorRef = useRef(null);
    const [userInfo, setUserInfo] = useAtom($stroe.user_base_info);
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
