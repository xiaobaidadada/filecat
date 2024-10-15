import React, {ReactNode, useEffect, useState} from 'react';
import {ActionButton} from "../../../../meta/component/Button";
import Header from "../../../../meta/component/Header";
import AceEditor from "react-ace";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {useLocation, useNavigate} from "react-router-dom";
import {editor_data} from "../../../util/store.util";
import {NotySucess} from "../../../util/noty";

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
export default function FileEditor() {
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [editorValue, setEditorValue] = useState(undefined)
    const navigate = useNavigate();
    const location = useLocation();
    const [have_update,set_have_update] = useState(false);

    useEffect(() => {
        set_have_update(false);
        setEditorValue(editor_data.get_value_temp() ?? null);
    }, [editorSetting]);

    function handleEditorChange(data) {
        editor_data.set_value_temp(data);
        if (!have_update) {
            set_have_update(true);
        }
        // setEditorValue(data)
    }
    function cancel () {
        editor_data.set_value_temp('')
        setEditorSetting({open: false,model:'',fileName:'',save:null})
    }
    async function save() {
        if (editorSetting.save && have_update) {
            await editorSetting.save(editor_data.get_value_temp());
            editor_data.set_value_temp('');
            // NotySucess("保存成功")
            set_have_update(false);
            // navigate(location.pathname);
        }
    }
    const handleKeyDown = (event) => {
        if (event.ctrlKey && event.key === 's') {
            event.preventDefault();
            save();
        }
    };
    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [have_update,editorSetting]);

    const div = <div id="editor-container">
        <Header ignore_tags={true} left_children={[<ActionButton key={1} title={"取消"} icon={"close"} onClick={cancel}/>,
            <title key={2}>{editorSetting.fileName}</title>]}>
            {editorSetting.menu_list && editorSetting.menu_list}
            {have_update && <ActionButton title={"保存"} icon={"save"} onClick={save}/>}
        </Header>
        <AceEditor // 使用默认值重新渲染
            mode={editorSetting.model}
            width="100%"
            height="100%"
            theme={"github"}
            onChange={handleEditorChange}
            fontSize={14}
            showPrintMargin={false}
            showGutter={true}
            highlightActiveLine={false}
            defaultValue={editor_data.get_value_temp()}
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
