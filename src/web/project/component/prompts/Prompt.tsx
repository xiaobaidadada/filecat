import React from 'react';
import {FilesUpload} from "./FilesUpload";
import {FilesDelete} from "./FilesDelete";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Paste} from "./Paste";
import {Overlay} from "../../../meta/component/Dashboard";
import {DirNew} from "./DirNew";
import {FileNew} from "./FileNew";
import {FileRename} from "./FileRename";
import {DockerDel} from "./DockerDel";
import {NavIndexAdd} from "./NavIndexAdd";
import {SshDelete} from "./ssh/SshDelete";
import {SshNewDir} from "./ssh/SshNewDir";
import {SshNewFile} from "./ssh/SshNewFile";
import {SshPaste} from "./ssh/SshPaste";
import {SshReName} from "./ssh/SshReName";
import {SshUpload} from "./ssh/SshUpload";
import {FileMenu} from "./FileMenu/FileMenu";
import {Compress} from "./FileMenu/Compress";
import {Confirm} from "./Confirm";
import {PromptCard} from "./PromptCard";
import {DdnsAddHttp} from "./DdnsAddHttp";

export enum PromptEnum {
    FilesUpload = "FilesUpload",
    FilesDelete = "FilesDelete",
    Confirm = "Confirm",
    DirNew = "DirNew",
    FileNew = "FileNew",
    FileRename = "FileRename",
    DockerDel = "DockerDel",
    NavIndexAdd = "NavIndexAdd",
    SshDelete = "SshDelete",
    SshNewDir = "SshNewDir",
    SshNewFile = "SshNewFile",
    SshPaste = "SshPaste",
    SshReName = "SshReName",
    SshUpload = "SshUpload",
    FileMenu = "FileMenu",
    Compress = "Compress",
    DdnsAddHttp = "DdnsAddHttp",
}

export default function Prompt() {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [confirm, set_confirm] = useRecoilState($stroe.confirm);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    function click() {
        setShowPrompt({show: false, type: '', overlay: false, data: {}});
        set_confirm({open: false, handle: null})
        set_prompt_card({open: false})
    }

    let div = <div></div>;
    let confirm_div = <Confirm/>;
    let prompt_card_div = <PromptCard/>;
    switch (showPrompt.type) {
        case PromptEnum.FilesUpload:
            div = <FilesUpload></FilesUpload>
            break;
        case PromptEnum.FilesDelete:
            div = <FilesDelete></FilesDelete>
            break;
        case PromptEnum.Confirm:
            div = <Paste></Paste>
            break;
        case PromptEnum.DirNew:
            div = <DirNew></DirNew>
            break;
        case PromptEnum.FileNew:
            div = <FileNew></FileNew>
            break;
        case PromptEnum.FileRename:
            div = <FileRename></FileRename>
            break;
        case PromptEnum.DockerDel:
            div = <DockerDel/>
            break;
        case PromptEnum.NavIndexAdd:
            div = <NavIndexAdd/>
            break;
        case PromptEnum.SshDelete:
            div = <SshDelete/>
            break;
        case PromptEnum.SshNewDir:
            div = <SshNewDir/>
            break;
        case PromptEnum.SshNewFile:
            div = <SshNewFile/>
            break;
        case PromptEnum.SshPaste:
            div = <SshPaste/>
            break;
        case PromptEnum.SshReName:
            div = <SshReName/>
            break;
        case PromptEnum.SshUpload:
            div = <SshUpload/>
            break;
        case PromptEnum.FileMenu:
            div = <FileMenu/>
            break;
        case PromptEnum.Compress:
            div = <Compress/>
            break;
        case PromptEnum.DdnsAddHttp:
            div = <DdnsAddHttp/>
            break;
    }

    return (<div>
        {prompt_card.open && prompt_card_div}
        {prompt_card.open && <Overlay click={click}/>}
        {confirm.open && confirm_div}
        {confirm.open && <Overlay click={click}/>}
        {showPrompt.show && div}
        {showPrompt.show && showPrompt.overlay && <Overlay click={click}/>}
    </div>)
}

