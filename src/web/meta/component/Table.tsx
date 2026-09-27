import React, {ReactNode, useEffect, useRef, useState} from 'react';

export interface TableProps {
    headers?: string[],
    rows?: any[][],
    width?: any,
}

// 当引用table的页面有任何状态更新的时候，所有元素都会更新，也会包括这个列表，特别是对于实时渲染的页面会出现这个问题。要注意停止ws请求
export function Table(props: { children?: ReactNode[]; headers?: any[], rows?: ReactNode[], width?: string,handleContextMenu?: (row:any) => void,
    // 提供该函数时才开启行的上下拖动；数据顺序由调用者自行处理（from / to 为原始索引）
    onRowDrag?: (from: number, to: number) => void }) {
    const [rows, setRows] = React.useState([]);
    // 当前正在拖动的行索引；-1 表示没有在拖动（ref 供事件里即时读取，state 供渲染使用）
    const drag_index = useRef(-1);
    const [dragging_index, setDraggingIndex] = useState(-1);
    // 当前悬停到的目标行索引，用于显示插入位置提示
    const [over_index, setOverIndex] = useState(-1);
    useEffect(() => {
        //优先
        if (props.children) {
            setRows(!Array.isArray(props.children) ? [props.children] : props.children);
        } else {
            setRows(props.rows);
        }
    }, [props.rows,props.children]);

    // 清除拖动状态，避免拖动结束后残留高亮
    const clear_drag = () => {
        drag_index.current = -1;
        setDraggingIndex(-1);
        setOverIndex(-1);
    }
    // 拖动结束：把源行移动到目标行位置，具体数据由调用者处理
    const on_drop = () => {
        const from = drag_index.current;
        const to = over_index;
        clear_drag();
        if (from < 0 || to < 0 || from === to) {
            return;
        }
        props.onRowDrag?.(from, to);
    }
    return <table>
        <thead>
        <tr>
            {props.headers?.map((header: string, index) => (<th key={index}>{header}</th>))}
        </tr>
        </thead>

        <tbody>
        {rows.map((row, index) => {
                const draggable = !!props.onRowDrag;
                return (<tr key={index}
                            className={draggable ? (dragging_index === index ? "row-dragging" : "") + (over_index === index ? " row-drop-target" : "") : ""}
                            draggable={draggable}
                            onContextMenu={() => {
                                if (props.handleContextMenu) {
                                    props.handleContextMenu(row);
                                }
                            }}
                            onDragStart={(e) => {
                                if (!draggable) {
                                    return;
                                }
                                drag_index.current = index;
                                setDraggingIndex(index);
                                e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragOver={(e) => {
                                if (!draggable || drag_index.current < 0) {
                                    return;
                                }
                                // 必须阻止默认行为，否则不会触发 drop
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setOverIndex(index);
                            }}
                            onDrop={(e) => {
                                if (!draggable) {
                                    return;
                                }
                                e.preventDefault();
                                on_drop();
                            }}
                            onDragEnd={clear_drag}>
                    {row.map((cell, col_index) => {
                        const cls = col_index === row.length - 1 ? "small" : "";
                        return (<td key={col_index} className={cls}
                                    style={{width: props.width ?? "auto"}}>{cell}</td>);
                    })}
                </tr>);
            }
        )}
        </tbody>
    </table>
}

// 多行
export function Rows(props: { columns: ReactNode[], isFlex?: boolean }) {
    return <div style={{
        display: props.isFlex ? 'flex' : 'block',
    }}>
        {props.columns.map((column, index) => {
            return <div key={index}>{column}</div>
        })}
    </div>
}
