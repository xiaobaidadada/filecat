import React, {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";

// Markdown 编辑器左侧大纲面板。
//
// 数据来源：ProseMirror 文档里所有 heading 节点（由 MdWysiwygEditor 的
// get_headings() 提取），每个条目记录标题文本、级别和文档位置。
// 交互：
//   · 点击条目 → 光标跳到该标题位置并滚动到视野内
//   · 箭头 → 折叠/展开某个标题下的子标题（层次 1-6）
//   · 顶部显示当前光标所在标题，高亮对应条目（由 active_pos 决定）

export interface OutlineItem {
    /** 标题级别 1-6 */
    level: number;
    /** 标题纯文本 */
    text: string;
    /** 标题节点在 ProseMirror 文档中的起始位置 */
    pos: number;
}

interface Props {
    items: OutlineItem[];
    /** 当前光标所在标题的 pos，用于高亮；-1 表示不在任何标题上 */
    active_pos: number;
    /** 点击条目时的跳转回调 */
    on_click: (item: OutlineItem) => void;
}

// 把扁平标题列表整理成带层级的树。
// 规则与主流编辑器一致：某个标题的层级由「下一个同级或更高级标题」界定，
// 遇到更高级别（level 更小）的标题就回到上层，中间跳级（如 h1 → h3）按当前层级处理。
interface OutlineNode extends OutlineItem {
    children: OutlineNode[];
}

function build_tree(items: OutlineItem[]): OutlineNode[] {
    const roots: OutlineNode[] = [];
    // 栈里保存的是「尚未闭合」的祖先节点，栈顶是最深的一层
    const stack: OutlineNode[] = [];
    for (const item of items) {
        const node: OutlineNode = {...item, children: []};
        // 弹出所有级别 >= 当前级别的祖先，它们不可能再接纳子节点
        while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
            stack.pop();
        }
        if (stack.length === 0) {
            roots.push(node);
        } else {
            stack[stack.length - 1].children.push(node);
        }
        stack.push(node);
    }
    return roots;
}

export default function MdOutline(props: Props) {
    const {t} = useTranslation();
    // 折叠状态：存被折叠的标题 pos。默认全部展开，所以初始为空集合。
    const [collapsed, set_collapsed] = useState<Set<number>>(new Set());

    const tree = useMemo(() => build_tree(props.items), [props.items]);

    // 折叠某个标题：切换其 pos 在集合中的存在性
    const toggle = (pos: number, event: React.MouseEvent) => {
        event.stopPropagation();
        set_collapsed(prev => {
            const next = new Set(prev);
            if (next.has(pos)) {
                next.delete(pos);
            } else {
                next.add(pos);
            }
            return next;
        });
    };

    // 递归渲染节点。depth 用于缩进，不用 marginLeft 叠加以便于 CSS 统一控制。
    const render_nodes = (nodes: OutlineNode[], depth: number): React.JSX.Element[] => {
        return nodes.map(node => {
            const has_children = node.children.length > 0;
            const is_collapsed = collapsed.has(node.pos);
            const is_active = node.pos === props.active_pos;
            return (
                <div key={node.pos}>
                    <div
                        className={`md-outline-item md-outline-item--h${node.level}${is_active ? " md-outline-item--active" : ""}`}
                        style={{paddingLeft: `${0.4 + depth * 0.75}em`}}
                        title={node.text}
                        onClick={() => props.on_click(node)}
                    >
                        {/* 有子节点时才显示折叠箭头，没有则留同宽占位保证文字左对齐 */}
                        <i
                            className={`material-icons md-outline-arrow${has_children ? "" : " md-outline-arrow--empty"}`}
                            onClick={has_children ? (e) => toggle(node.pos, e) : undefined}
                        >
                            {has_children ? (is_collapsed ? "arrow_right" : "arrow_drop_down") : ""}
                        </i>
                        <span className="md-outline-text">{node.text || t("未命名标题")}</span>
                    </div>
                    {has_children && !is_collapsed && render_nodes(node.children, depth + 1)}
                </div>
            );
        });
    };

    if (props.items.length === 0) {
        return (
            <div className="md-outline md-outline--empty">
                {/*<div className="md-outline-header">{t("大纲")}</div>*/}
                <div className="md-outline-tip">{t("no_head")}</div>
            </div>
        );
    }

    return (
        <div className="md-outline">
            {/*<div className="md-outline-header">{t("大纲")}</div>*/}
            {/* 用 div 承载列表：大纲条目需要自定义缩进和折叠箭头，不适合 ul/li 默认样式 */}
            <div className="md-outline-list">
                {render_nodes(tree, 0)}
            </div>
        </div>
    );
}
