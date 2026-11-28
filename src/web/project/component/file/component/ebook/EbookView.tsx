import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {Http} from "../../../../util/http";
import {ActionButton} from "../../../../../meta/component/Button";
import "./ebook.css";

/** 按扩展名给 MIME，foliate-js 的格式探测也认后缀 */
const MIME_MAP: Record<string, string> = {
    epub: "application/epub+zip",
    mobi: "application/x-mobipocket-ebook",
    azw: "application/vnd.amazon.ebook",
    azw3: "application/vnd.amazon.ebook",
    fb2: "application/x-fictionbook+xml",
    fbz: "application/x-zip-compressed-fb2",
    cbz: "application/vnd.comicbook+zip",
};

/** 目录是嵌套结构（subitems），压平成带层级的一维列表给侧栏渲染 */
function flatten_toc(toc?: any[]): { label: string, href: string, depth: number }[] {
    const flat: { label: string, href: string, depth: number }[] = [];
    const walk = (items: any[], depth: number) => {
        for (const it of items) {
            flat.push({label: String(it.label ?? "").trim(), href: it.href, depth});
            if (it.subitems?.length) {
                walk(it.subitems, depth + 1);
            }
        }
    };
    if (toc?.length) {
        walk(toc, 0);
    }
    return flat;
}

/**
 * 电子书阅读内核：取文件、翻页、目录，渲染交给 foliate-js。
 * 自己只画内容和操作条，外层外壳（全屏 / Studio 内嵌）由调用方提供。
 */
export default function EbookView(props: { url: string, name?: string, extra_left?: React.ReactNode }) {
    const {url, name} = props;
    const {t} = useTranslation();
    const view_ref = useRef<HTMLElement & {
        open: (file: File) => Promise<unknown>,
        init: (opt?: { lastLocation?: unknown, showTextStart?: boolean }) => Promise<void>,
        goLeft: () => void,
        goRight: () => void,
        goTo: (href: string) => Promise<void>,
        close: () => void,
        book?: { toc?: any[], metadata?: { title?: unknown } },
    }>();
    const host_ref = useRef<HTMLDivElement>(null);
    const [loading, set_loading] = useState(true);
    const [error, set_error] = useState("");
    const [toc, set_toc] = useState<{ label: string, href: string, depth: number }[]>([]);
    const [show_toc, set_show_toc] = useState(false);
    /** 0~100 的阅读进度 */
    const [fraction, set_fraction] = useState(0);

    /** 断开 foliate 的 ResizeObserver 并移除 DOM，连续调用安全 */
    const destroy_view = () => {
        const view = view_ref.current;
        if (!view) {
            return;
        }
        view_ref.current = undefined;
        try {
            view.close();
        } catch (e) {
            // foliate 内部元素已卸载时 close 可能抛错，忽略即可
        }
        view.remove();
    };

    const on_key = (e: KeyboardEvent) => {
        let delta = 0;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            delta = -1;
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            delta = 1;
        }
        if (!delta || e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (delta < 0) {
            view_ref.current?.goLeft();
        } else {
            view_ref.current?.goRight();
        }
    };

    /**
     * 销毁要赶在 React 摘下 DOM 之前：普通 effect 的 cleanup 跑在 DOM 移除之后，
     * 那时 foliate 的 ResizeObserver 已经对脱离文档的 iframe 触发过一次通知。
     * useLayoutEffect 的 cleanup 在 DOM 变更前同步执行，顺序才对。
     */
    useLayoutEffect(() => {
        return () => {
            destroy_view();
        };
    }, []);

    useEffect(() => {
        if (!url) {
            return;
        }
        let alive = true;
        // 换书时先销毁上一本，否则旧 foliate-view 会留在容器里继续跑 ResizeObserver
        destroy_view();
        set_loading(true);
        set_error("");
        set_toc([]);
        set_fraction(0);

        (async () => {
            // foliate-js 是纯 ESM 源码，且内部大量用自定义元素和 iframe，
            // 只在真正打开电子书时才加载，避免拖慢首屏
            await import("foliate-js/view.js");
            // foliate 的 Paginator 用 ResizeObserver 直接调 render()，缩放时 render 又改 iframe
            // 尺寸，形成「改尺寸 -> 再通知」的循环，浏览器会抛 ResizeObserver loop 错误。
            // 这里把 render 包一层 rAF 去重：同一帧多次调用只执行最后一次，循环即被打破。
            const patch_paginator = () => {
                const paginator = customElements.get("foliate-paginator") as any;
                if (!paginator || paginator.__render_patched) {
                    return;
                }
                const raw_render = paginator.prototype.render;
                const pending = new WeakMap<object, number>();
                paginator.prototype.render = function (...args: unknown[]) {
                    const old = pending.get(this);
                    if (old) {
                        cancelAnimationFrame(old);
                    }
                    pending.set(this, requestAnimationFrame(() => {
                        pending.delete(this);
                        raw_render.apply(this, args);
                    }));
                };
                paginator.__render_patched = true;
            };
            patch_paginator();
            const bytes = await Http.get_bytes_url(url);
            const file_name = name ?? "book.epub";
            const ext = file_name.slice(file_name.lastIndexOf(".") + 1).toLowerCase();
            const file = new File([bytes as BlobPart], file_name, {type: MIME_MAP[ext] ?? "application/octet-stream"});
            if (!alive || !host_ref.current) {
                return;
            }
            // 手动创建：必须在容器已有稳定尺寸前先把 view 挂上去，否则 foliate 内部
            // ResizeObserver 会在 iframe 尚未就绪时触发 render 并读到 null 的 body
            const view = document.createElement("foliate-view") as typeof view_ref.current;
            host_ref.current.appendChild(view);
            view_ref.current = view;
            // 翻页后同步阅读进度：必须在实例存在后绑定，首次挂载时 ref 还是 undefined
            view.addEventListener("relocate", (e: Event) => {
                const detail = (e as CustomEvent).detail;
                if (typeof detail?.fraction === "number") {
                    set_fraction(Math.round(detail.fraction * 100));
                }
            });
            // 正文在 closed shadow 的 iframe 里，按键只能从 foliate 的 load 事件拿到 document 再绑
            view.addEventListener("load", (e: Event) => {
                const doc = (e as CustomEvent).detail?.doc as Document | undefined;
                doc?.addEventListener("keydown", on_key, true);
            });
            await view.open(file);
            if (!alive) {
                return;
            }
            // open() 之后 foliate 才真正把 view.js/paginator.js 加载完，此时补丁才能生效
            patch_paginator();
            await view.init({showTextStart: true});
            if (!alive) {
                return;
            }
            set_toc(flatten_toc(view.book?.toc));
            set_loading(false);
        })().catch((e) => {
            if (alive) {
                set_error(String(e?.message ?? e));
                set_loading(false);
            }
        });

        return () => {
            alive = false;
        };
    }, [url]);

    useEffect(() => {
        document.addEventListener("keydown", on_key, true);
        return () => {
            document.removeEventListener("keydown", on_key, true);
        };
    }, []);

    /**
     * foliate 的 paginator 在 ResizeObserver 回调里改 iframe 尺寸，又会再次触发通知，
     * 浏览器必然抛这条 loop 警告。内容本身渲染正确，属无害噪音，这里只在阅读器存活期间吞掉它。
     */
    useEffect(() => {
        const is_ro_loop = (msg: string) => msg.includes("ResizeObserver loop");
        const on_error = (e: ErrorEvent) => {
            if (is_ro_loop(String(e.message ?? ""))) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        const on_rejection = (e: PromiseRejectionEvent) => {
            if (is_ro_loop(String((e.reason as Error)?.message ?? e.reason ?? ""))) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        window.addEventListener("error", on_error, true);
        window.addEventListener("unhandledrejection", on_rejection, true);
        return () => {
            window.removeEventListener("error", on_error, true);
            window.removeEventListener("unhandledrejection", on_rejection, true);
        };
    }, []);

    return (
        <div className={"ebook-body"}>
            <div className={"ebook-bar"}>
                {props.extra_left}
                <ActionButton icon={"toc"} title={t("目录")} onClick={() => set_show_toc(!show_toc)}/>
                <ActionButton icon={"chevron_left"} title={t("上一页")}
                              onClick={() => view_ref.current?.goLeft()}/>
                <span className={"ebook-progress"}>{fraction}%</span>
                <ActionButton icon={"chevron_right"} title={t("下一页")}
                              onClick={() => view_ref.current?.goRight()}/>
            </div>
            <div className={"ebook-view"} ref={host_ref}/>
            {loading && <div className={"ebook-loading"}>{t("加载中")}</div>}
            {error && <div className={"ebook-loading"}>{error}</div>}
            {show_toc && <div className={"ebook-toc"}>
                {toc.map((it, i) => (
                    <div key={i}
                         className={"ebook-toc__item"}
                         style={{paddingLeft: `${.5 + it.depth * .9}rem`}}
                         onClick={() => {
                             view_ref.current?.goTo(it.href);
                             set_show_toc(false);
                         }}>
                        {it.label}
                    </div>
                ))}
            </div>}
        </div>
    );
}
