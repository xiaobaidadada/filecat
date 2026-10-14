/**
 * ```smm-mind 思维导图代码块的渲染。
 *
 * 代码块里的内容就是 simple-mind-map 的节点数据（与 .mind 文件同格式，
 * 兼容旧的 {id,text,children} 格式），渲染成只读的思维导图，支持缩放/平移。
 *
 * 与 mermaid / svg 的区别：那两者产出的是 SVG 字符串，直接 innerHTML 即可；
 * 思维导图是命令式组件（必须在元素挂载到文档后 new），因此这里返回挂载函数，
 * 由调用方在合适时机挂载，并在卸载时销毁实例。
 *
 * simple-mind-map 体积较大，全程动态 import，只有文档里真的出现该代码块时才加载。
 */

import "simple-mind-map/dist/simpleMindMap.esm.css";

/** 该语言是否走思维导图渲染 */
export function is_mind_lang(lang: string): boolean {
    return lang === "smm-mind";
}

/** simple-mind-map 的加载缓存：并发调用只加载一次 */
let mind_task: Promise<any> | null = null;

function load_mind_map(): Promise<any> {
    if (!mind_task) {
        mind_task = import("simple-mind-map").then(mod => mod.default);
    }
    return mind_task;
}

/**
 * 把代码块内容解析成 simple-mind-map 的节点数据。
 * 解析失败或内容为空时返回 null（调用方视为空导图）。
 */
export function parse_mind_data(code: string): any {
    const text = code.trim();
    if (!text) {
        return null;
    }
    let data: any = null;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    return to_simple_mind_data(data);
}

/**
 * 把数据规整成 simple-mind-map 能吃的节点数据。
 * 本库（.mind 文件）的格式是 {data:{text,...}, children:[...]}，入参可能是：
 *   1. 完整文件数据：{layout, root:{data:{text}}, theme, view}
 *   2. 单个节点对象：{data:{text}, children}
 *   3. 早期自研格式：{id, text, children}
 *   4. 常见的 nodeData 格式：{data:{nodeData:{id, topic, children}}}
 *   （AI 生成思维导图代码块时容易写成这种，节点用 topic 表示文本）
 */
export function to_simple_mind_data(input: any): any {
    if (!input || typeof input !== "object") {
        return null;
    }
    // nodeData 包装：文本字段是 topic
    if (input.data?.nodeData) {
        return convert_node_data(input.data.nodeData);
    }
    // 本库格式：root 下是一个节点对象（含 data.text）
    if (input.root && typeof input.root === "object") {
        if (input.root.data) {
            return input.root;
        }
        return convert_legacy_node(input.root);
    }
    // 可能直接就是节点对象
    if (input.data && typeof input.data === "object") {
        return input;
    }
    return convert_legacy_node(input);
}

/** 把 nodeData 结构（topic + children）转成 simple-mind-map 的节点（data.text + children） */
function convert_node_data(n: any): any {
    // 节点可能是 {id, topic, children}，也可能已经带了 data 层
    const text = typeof n?.topic === "string" ? n.topic : (typeof n?.data?.text === "string" ? n.data.text : "");
    return {
        data: {text},
        children: Array.isArray(n?.children) ? n.children.map(convert_node_data) : [],
    };
}

/** 把旧自研节点（text/children）转成 simple-mind-map 节点（data.text/children） */
function convert_legacy_node(n: any): any {
    return {
        data: {
            text: typeof n?.text === "string" ? n.text : "",
            ...(n?.note ? {note: n.note} : {}),
        },
        children: Array.isArray(n?.children) ? n.children.map(convert_legacy_node) : [],
    };
}

export interface MindMountOptions {
    /** 是否可编辑；默认只读（只能缩放/平移查看）。放大编辑时传 true */
    editable?: boolean;
}

/** 挂载后的实例句柄 */
export interface MindInstance {
    /** 销毁实例 */
    destroy: () => void;
    /** 取当前节点树数据（simple-mind-map 的 {data:{text}, children} 结构） */
    get_data: () => any;
}

export interface MindMount {
    /** 解析出的节点数据，null 表示内容为空或非法 JSON */
    data: any;
    /** 实例化导图并挂到容器；返回实例句柄 */
    mount: (el: HTMLElement, options?: MindMountOptions) => Promise<MindInstance>;
}

/** 等元素进入文档并拿到尺寸；用于 widget 这类「先构造 DOM，再被框架插入文档」的场景 */
function wait_visible(el: HTMLElement, cancelled: () => boolean): Promise<boolean> {
    return new Promise(resolve => {
        const check = () => {
            if (cancelled()) {
                resolve(false);
                return;
            }
            if (el.isConnected && el.clientWidth && el.clientHeight) {
                resolve(true);
                return;
            }
            window.setTimeout(check, 16);
        };
        check();
    });
}

/**
 * 准备一个思维导图的挂载任务。
 * 内容非法（JSON 解析失败）时 data 为 null，此时视为一个空导图（只有中心主题），
 * 与编辑器里“正在输入时不合法”的表现一致，不抛错。
 */
export async function prepare_mind(code: string): Promise<MindMount> {
    const data = parse_mind_data(code);
    const MindMap = await load_mind_map();
    return {
        data,
        async mount(el: HTMLElement, options?: MindMountOptions): Promise<MindInstance> {
            // 必须等元素进入文档且有尺寸后再构造：
            // simple-mind-map 在构造时按容器位置/尺寸执行 fit，尺寸为 0 时
            // 算出的平移量会把导图画到容器外（表现为空白框）。
            let destroyed = false;
            const ok = await wait_visible(el, () => destroyed);
            if (!ok) {
                return {destroy: () => {}, get_data: () => null};
            }
            const mm = new MindMap({
                el,
                data: data ?? {data: {text: ""}},
                // 默认只读：不能编辑节点，但可以缩放/平移查看；放大编辑时放开
                readonly: !options?.editable,
                // 构造期容器尺寸已就绪，可以直接自适应
                fit: true,
            });
            return {
                destroy: () => {
                    destroyed = true;
                    mm?.destroy?.();
                },
                // getData(false) 只取节点树，不带上 layout/theme/view，
                // 写回 ```smm-mind 时保持与原始数据同构
                get_data: () => mm?.getData?.(false),
            };
        },
    };
}
