import React, {ReactNode, useEffect, useRef, useState} from 'react';
import {Ace as AceItem, version as ace_version} from "ace-builds";
import * as ace from "ace-builds";
import "ace-builds/src-noconflict/mode-json"; // 几个常用的不需要网络
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-markdown";
import "ace-builds/src-noconflict/mode-tsx";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-sh";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/theme-cloud9_day";
import "ace-builds/src-noconflict/theme-cloud_editor_dark";
ace.config.set("basePath", `https://gcore.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`);
ace.config.set('modePath', `https://gcore.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`);
ace.config.set('themePath',`https://gcore.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`);
ace.config.set('workerPath',`https://gcore.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`);
import modelist from "ace-builds/src-noconflict/ext-modelist";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {editor_data} from "../../../util/store.util";
// import "ace-builds/src-noconflict/ext-language_tools";


// name 是用于获取 类型的方式
export default function Ace(props:{name: string,model?:string,on_change?:()=>void,options?: Partial<AceItem.EditorOptions>,editor_id?:number}) {
    const editorRef = useRef(null);
    const [userInfo, setUserInfo] = useRecoilState($stroe.user_base_info);
    const theme = userInfo.user_data.theme ===  "dark"? "cloud_editor_dark" : "cloud9_day";
    useEffect(() => {
        const editor = ace.edit(editorRef.current, {
            value: editor_data.get_value_temp(props.editor_id),
            showPrintMargin: false,
            // readOnly: true,
            theme: `ace/theme/${theme}`,
            mode: props.model ?? modelist.getModeForPath(props.name ?? '').mode,
            wrap: false,
            highlightActiveLine:false, // 鼠标放在一行上的高亮
            fontSize:14,
            // fontFamily:"JetBrains Mono"
            ...props.options,
        });
        // 语言智能提醒需要 import "ace-builds/src-noconflict/ext-language_tools";
        editor.setOptions({
            enableBasicAutocompletion: true, // 语言的基本自动补全 需要按 table
            enableSnippets: true, // 快速插入模板，会有提示 安装enter键入 fori这样的
            enableLiveAutocompletion: true // 实时提醒
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
        editor_data.set_editor_temp(editor,props.editor_id);

        return () => {
            editor_data.delete_editor_temp(props.editor_id);
            editor.destroy();
        };
    }, []);

    return <div ref={editorRef}  style={{ height: '100%', width: '100%' }} />
}
