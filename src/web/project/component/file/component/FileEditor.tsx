import React, {ReactNode, useEffect, useRef, useState} from 'react';
import {ActionButton} from "../../../../meta/component/Button";
import Header from "../../../../meta/component/Header";
// import AceEditor from "react-ace";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {useLocation, useNavigate} from "react-router-dom";
import {editor_data} from "../../../util/store.util";
import {NotySucess} from "../../../util/noty";
import Ace from "./Ace";



export default function FileEditor() {
    const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [have_update,set_have_update] = useState(false);

    function handleEditorChange() {
        if (!have_update) {
            set_have_update(true);
        }
    }
    function cancel () {
        editor_data.set_value_temp('')
        setEditorSetting({open: false,model:'',fileName:'',save:null})
    }
    async function save() {
        if (editorSetting.save && have_update) {
            await editorSetting.save(editor_data.get_editor_value() );
            editor_data.set_value_temp('');
            // NotySucess("保存成功")
            set_have_update(false);
            // navigate(location.pathname);
        }
    }
    const handleKeyDown = (event) => {
        if (event.ctrlKey && event.key === 's') {
            event.preventDefault();
            if (editorSetting.save && have_update) {
                save();
            }
        }
    };
    useEffect(() => {
        return () => {
            set_have_update(false);
        }
    }, [editorSetting]);
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
        <Ace name={editorSetting.fileName} model={editorSetting.model} on_change={handleEditorChange} />
    </div>;
    return editorSetting.open && div
}
