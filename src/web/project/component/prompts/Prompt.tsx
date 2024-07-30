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
import {FileMenu} from "./FileMenu";

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
}

export function Prompt() {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);

    function click() {
        setShowPrompt({show: false, type: '', overlay: false,data: {}});
    }

    let div = <div></div>;
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
            div = <DockerDel />
            break;
        case PromptEnum.NavIndexAdd:
            div = <NavIndexAdd />
            break;
        case PromptEnum.SshDelete:
            div = <SshDelete />
            break;
        case PromptEnum.SshNewDir:
            div = <SshNewDir />
            break;
        case PromptEnum.SshNewFile:
            div = <SshNewFile />
            break;
        case PromptEnum.SshPaste:
            div = <SshPaste />
            break;
        case PromptEnum.SshReName:
            div = <SshReName />
            break;
        case PromptEnum.SshUpload:
            div = <SshUpload />
            break;
        case PromptEnum.FileMenu:
            div = <FileMenu />
            break;
    }

    return (<div>
        {showPrompt.show && div}
        {showPrompt.show && showPrompt.overlay && <Overlay click={click}/>}
    </div>)
}

