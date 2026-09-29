import React from 'react'

/**
 * 「多实例列表」中的单个实例外壳。
 *
 * 用于「一个列表里可以添加多个实例，每个实例有自己的若干属性 + 子列表」的场景，
 * 例如 Http Proxy Server 的端口实例、客户端文件同步的同步目标。
 * 组件只负责外壳与标题，头部字段与操作按钮全部由 children 传入，各页自行决定。
 */
export function InstanceItem(props: {
    key?: React.Key,
    title: React.ReactNode,
    children?: React.ReactNode,
    /** 头部字段区（标题右侧那一排控件） */
    toolbar?: React.ReactNode,
}) {
    return <div className={"instance-item"}>
        <div className={"instance-item__toolbar"}>
            <span className={"instance-item__label"}>{props.title}</span>
            {props.toolbar}
        </div>
        {props.children}
    </div>
}
