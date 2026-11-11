import React, {useEffect, useState} from 'react';

/**
 * 通用头像组件。
 *
 * 约定：
 * - 有 src 时显示圆形头像图片，加载失败则不渲染破图，退化为首字母色块；
 * - 没有 src 时同样退化为首字母色块，保证标题高度不塌陷；
 * - 传入 show_name 时把名字渲染在头像右侧，头像与名字是一个整体展示单元；
 * - 传入 label_width 时按 InputRow 的横向布局渲染：左侧固定宽度 label、右侧头像，
 *   用于和其他 InputRow 字段左边缘对齐。
 */
export function Avatar(props: {
    /** 头像图片地址；为空或加载失败时走首字母兜底 */
    src?: string,
    /** 显示名，同时用于兜底首字母、alt 和右侧名字 */
    name?: string,
    /** 直径，单位为 rem，默认 1.5 */
    size?: number,
    /** 是否在头像右侧显示名字，默认显示；没有名字时不显示 */
    show_name?: boolean,
    /** 左侧标签；设置了才走 InputRow 式对齐布局 */
    label?: string,
    /** 左侧标签宽度，与 InputRow 的 label_width 用法一致，如 "7rem" */
    label_width?: string,
    className?: string,
}) {
    const {src, name, size = 1.5, show_name = true, label, label_width, className} = props;
    /** 图片加载失败标记，失败后不再尝试显示图片 */
    const [broken, set_broken] = useState(false);

    /** 换了新的 src 要重置失败标记，否则换图后会一直停在兜底状态 */
    useEffect(() => {
        set_broken(false);
    }, [src]);

    const style: React.CSSProperties = {
        width: `${size}rem`,
        height: `${size}rem`,
        borderRadius: '50%',
        flexShrink: 0,
        verticalAlign: 'middle',
    };

    const cls = ['avatar', className].filter(Boolean).join(' ');

    /** 图片可用就渲染图片，否则渲染首字母色块 */
    const visual = src && !broken
        ? <img className={cls}
               style={{...style, objectFit: 'cover'}}
               src={src}
               alt={name ?? ''}
               /* 部分图床有防盗链，不带 referrer 才能正常加载 */
               referrerPolicy={'no-referrer'}
               onError={() => set_broken(true)}/>
        : <span className={`${cls} avatar--fallback`}
                style={{...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
            {(name ?? '').trim().charAt(0).toUpperCase() || '?'}
        </span>;

    /** 头像本体（含可选的名字） */
    const content = (show_name && name)
        ? <span className={"avatar-with-name"}>
            {visual}
            <span className={"avatar__name"}>{name}</span>
        </span>
        : visual;

    // 没有 label 时直接返回头像，可放进标题、列表项等任意行内位置
    if (label === undefined) {
        return content;
    }

    // 有 label 时沿用 InputRow 的横向布局，保证多个字段左边缘对齐
    const label_css: React.CSSProperties = {
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
        textAlign: 'right',
    };
    if (label_width) {
        label_css.width = label_width;
    }
    return <div style={{display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
        <label style={label_css}>{label}</label>
        <div style={{flex: 1, minWidth: 0}}>{content}</div>
    </div>;
}
