import React, {ReactNode, useEffect, useState} from 'react';
import {ActionButton} from "../../../../meta/component/Button";
import Header from "../../../../meta/component/Header";
import AceEditor from "react-ace";
import "ace-builds/src-noconflict/theme-chaos";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/mode-text";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-ini";
import "ace-builds/src-noconflict/mode-c_cpp";
import "ace-builds/src-noconflict/mode-sh";
import "ace-builds/src-noconflict/mode-lua";
import "ace-builds/src-noconflict/mode-haml";
import "ace-builds/src-noconflict/mode-xml";
import "ace-builds/src-noconflict/mode-tsx";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/mode-sql";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-markdown";
import "ace-builds/src-noconflict/ext-language_tools";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {useLocation, useNavigate} from "react-router-dom";


const ace = require("ace-builds/src-noconflict/ace");
ace.config.set(
    "basePath",
    "https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/"
);
ace.config.setModuleUrl(
    "ace/mode/javascript_worker",
    "https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/worker-javascript.js"
);

export function Editor() {
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [editorValue, setEditorValue] = useRecoilState($stroe.editorValue)
    const navigate = useNavigate();
    const location = useLocation();

    function handleEditorChange(data) {
        setEditorValue(data)
    }
    function cancel () {
        setEditorValue('')
        setEditorSetting({open: false,model:'',fileName:'',save:null})
    }
    async function save() {
        if (editorSetting.save) {
            await editorSetting.save(editorValue);
            setEditorValue("");
            navigate(location.pathname);
        }
    }
    const div = <div id="editor-container">
        <Header ignore_tags={true} left_children={[<ActionButton key={1} title={"取消"} icon={"close"} onClick={cancel}/>,
            <title key={2}>{editorSetting.fileName}</title>]}>
            <ActionButton title={"保存"} icon={"save"} onClick={save}/>
        </Header>
        <AceEditor
            mode={editorSetting.model}
            width="100%"
            height="100%"
            theme={"github"}
            onChange={handleEditorChange}
            fontSize={14}
            showPrintMargin={false}
            showGutter={true}
            highlightActiveLine={false}
            value={editorValue}
            // wrapEnabled={true}
            setOptions={{
                useWorker: false,
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: true,
                enableSnippets: true,
                showLineNumbers: true,
                tabSize: 2,
                // wrap:true
            }}
        />
    </div>;
    return editorSetting.open && div
}
