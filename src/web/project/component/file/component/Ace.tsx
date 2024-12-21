import React, {ReactNode, useEffect, useRef, useState} from 'react';
import ace, {Ace as AceItem, version as ace_version} from "ace-builds";
import "ace-builds/src-noconflict/mode-json"; // 几个常用的不需要网络
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-markdown";
import "ace-builds/src-noconflict/mode-tsx";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-sh";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/theme-cloud9_day";
ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`);
ace.config.set('modePath', `https://cdn.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`);
ace.config.set('themePath',`https://cdn.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`);
ace.config.set('workerPath',`https://cdn.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`);
import modelist from "ace-builds/src-noconflict/ext-modelist";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {editor_data} from "../../../util/store.util";
import "ace-builds/src-noconflict/ext-language_tools";



export default function Ace(props:{name: string,on_change?:()=>void,options?: Partial<AceItem.EditorOptions>}) {
    const editorRef = useRef(null);

    useEffect(() => {
        const editor = ace.edit(editorRef.current, {
            value: editor_data.get_value_temp(),
            showPrintMargin: false,
            // readOnly: true,
            theme: "ace/theme/cloud9_day",
            mode: modelist.getModeForPath(props.name ?? '').mode,
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
        editor_data.set_editor_temp(editor);

        return () => {
            editor_data.set_editor_temp(null);
            editor.destroy();
        };
    }, []);

    return <div ref={editorRef}  style={{ height: '100%', width: '100%' }} />
}
