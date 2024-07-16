import React, {ReactNode, useEffect} from 'react';

export interface TableProps {
    headers?: string[],
    rows?: any[][],
    width?: any,
}

export function Table(props: { children?: ReactNode[]; headers?: string[], rows?: ReactNode[], width?: string }) {
    const [rows, setRows] = React.useState([]);
    useEffect(() => {
        //优先
        if (props.children) {
            setRows(!Array.isArray(props.children) ? [props.children] : props.children);
        } else {
            setRows(props.rows);
        }
    }, [props.rows,props.children]);
    return <table>
        <thead>
        <tr>
            {props.headers?.map((header: string, index) => (<th key={index}>{header}</th>))}
        </tr>
        </thead>

        <tbody>
        {rows.map((row, index) => {
                return (<tr key={index}>
                    {row.map((row, index) =>
                        (<td style={{
                            width: props.width ?? "auto",
                        }} key={index} className={index === rows.length - 1 ? "small" : ""}>{row}</td>)
                    )}
                </tr>)
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
