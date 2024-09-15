import React, {useEffect, useState} from "react";
import {FileTree, FileTypeEnum} from "../../../../../../../common/file.pojo";

export function Folder(props: FileTree & {
    key: any,
    pre_path: string,
    click?: (pojo: FileTree, set_children: (list: FileTree[]) => void, pre_path: string) => Promise<void>,
    handleContextMenu?: (event, name, path, isDir, toggleExpansion) => void
    fatherNowToggleExpansion?:()=>void
}): React.JSX.Element {
    {
        // 这里的pre_path 是以/结尾的
        const [expanded, setExpanded] = useState(false);
        const [children, setChildren] = useState<FileTree[]>([]);
        const set_children = (list: FileTree[]) => {
            setChildren(list);
        }
        const toggleExpansion = async () => {

            if (props.type === "folder") {
                if (!expanded && props.click && !children) {
                    await props.click(props, set_children, props.pre_path);
                }
                setExpanded(!expanded);
            } else {
                if (props.click) {
                    await props.click(props, set_children, props.pre_path);
                }
            }
        };
        const nowToggleExpansion = async (exec_fater_nowToggleExpansion = false) => {
            if (props.type === "folder" && !exec_fater_nowToggleExpansion) {
                await props.click(props, set_children, props.pre_path);
            } else {
                if(props.fatherNowToggleExpansion) {
                    props.fatherNowToggleExpansion();
                }
            }
        };

        useEffect(() => {
            setChildren(props.children);
        }, [props.children]);
        return (
            <div className={"studio-item"}>
                <div onClick={toggleExpansion} onContextMenu={(event) => {
                    event.stopPropagation()
                    event.nativeEvent.stopImmediatePropagation()
                    if (props.handleContextMenu) {
                        props.handleContextMenu(event, props.name, props.pre_path, props.type === FileTypeEnum.folder, nowToggleExpansion)
                    }
                }}
                     className={"studio-item-title"}>
                    <i className={"material-icons studio-item-title-tag"}>{props.type == "file" ? "" : (expanded ? 'arrow_drop_down' : 'arrow_right')}</i>
                    <i className={"material-icons"}
                       file-type={props.type}>{props.type === "folder" ? "folder" : "text_snippet"}</i>
                    <span className={"studio-item-name"}>{props.name}</span>
                </div>
                {expanded && children && (
                    <div style={{marginLeft: 20}}>
                        {children.map((child, index) => (
                            <React.Fragment key={index}>
                                {<Folder type={child.type} click={props.click} name={child.name} key={index}
                                         children={child.children} pre_path={`${props.pre_path}${child.name}${child.type===FileTypeEnum.folder ? "/":""}`}
                                         handleContextMenu={props.handleContextMenu}
                                         fatherNowToggleExpansion={nowToggleExpansion}
                                />}
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>
        );
    }
}