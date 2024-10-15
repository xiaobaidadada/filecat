import React, {ReactNode} from 'react';
import {tree_item, tree_list} from "../../../common/req/common.pojo";
import {FileTypeEnum} from "../../../common/file.pojo";


function TipButton(props: { click?: (data: any) => void } & { name?: string, onContextMenu?: (e, data) => void }) {
    return <div className={"black-tip"} onClick={() => {
        if (props.click) {
            props.click(props);
        }
    }}
        onContextMenu={(event) => {
            event.stopPropagation()
            event.nativeEvent.stopImmediatePropagation()
            if (props.onContextMenu) {
                props.onContextMenu(event, props)
            }
        }}
    >{props.name}</div>
}

// 树状组件
const TreeNode = (props: { node: tree_item, click?: (data: any) => void,onContextMenu?: (e, data) => void ,render?:(data:any)=>any}) => {
    return (
        <li>
            {props.click ? <TipButton {...props.node} name={props.render?props.render(props.node):props.node.name} click={props.click} onContextMenu={props.onContextMenu}></TipButton> :
                <div>{props.render?props.render(props.node):props.node.name}</div>}
            {props.node.children && props.node.children.length > 0 && (
                <ul>
                    {props.node.children.map((child, index) => (
                        // @ts-ignore
                        <TreeNode key={index} node={child} click={props.click} onContextMenu={props.onContextMenu} render={props.render}/>
                    ))}
                </ul>
            )}
        </li>
    );
};

// 主组件
const TreeView = (props: { list: tree_list, click?: (data: any) => void ,onContextMenu?: (e, data) => void,render?:(data:any)=>any}) => {
    return (<div className={"card-tree-view"}>
            <ul>
                {props.list && props.list.map((node, index) => (
                    // @ts-ignore
                    <TreeNode key={index} node={node} click={props.click} onContextMenu={props.onContextMenu} render={props.render}/>
                ))}
            </ul>
        </div>
    );
};

export default TreeView;
