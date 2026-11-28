import React, {useEffect, useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import OfficeEditorShell from "../office/OfficeEditorShell";
import {ActionButton} from "../../../../../meta/component/Button";
import {useTranslation} from "react-i18next";
import {Http} from "../../../../util/http";
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

/**
 * 目录是嵌套结构（subitems），压平成带层级的一维列表给侧栏渲染。
 */
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
 * 电子书阅读器：全屏只读，支持 epub/mobi/azw3/fb2/cbz。
 *
 * 渲染交给 foliate-js 的 <foliate-view> 自定义元素：
 * 它内部做 zip 解包 -> OPF 解析 -> 分页，分页内容放在 iframe 里。
 * 这里只负责取文件、翻页、目录跳转，不做任何解析。
 */
export default function EbookReader() {
    const {t} = useTranslation();
    const [reader, setReader] = useAtom($stroe.ebook_reader);
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

    const close = () => {
        const fn = reader.close;
        // 先销毁 foliate 内部 renderer（断开 ResizeObserver），再卸载 DOM，
        // 否则 observer 会在已脱离文档的元素上触发重排并报 loop 警告
        view_ref.current?.close();
        view_ref.current?.remove();
        view_ref.current = undefined;
        setReader({});
        fn?.();
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

    useEffect(() => {
        if (!reader.url) {
            return;
        }
        let alive = true;
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
            // url 已带 baseUrl 与 token，走项目统一的字节下载封装
            const bytes = await Http.get_bytes_url(reader.url as string);
            const name = reader.name ?? "book.epub";
            const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
            const file = new File([bytes as BlobPart], name, {type: MIME_MAP[ext] ?? "application/octet-stream"});
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
            // foliate 内部的 ResizeObserver 挂在 body/container 上，
            // 不显式 close 就只断开 DOM 引用，observer 仍会触发重排并报 loop 警告
            view_ref.current?.close();
            view_ref.current?.remove();
            view_ref.current = undefined;
        };
    }, [reader.url]);

    useEffect(() => {
        document.addEventListener("keydown", on_key, true);
        return () => {
            document.removeEventListener("keydown", on_key, true);
        };
    }, []);

    /**
     * 缩放窗口时把连续 ResizeObserver 回调合并成一次。
     * foliate 的 render() 会在回调里改滚动位置和 iframe 尺寸，缩放过程中每帧都触发
     * 就会形成「改尺寸 -> 再通知」的循环，浏览器报 ResizeObserver loop 警告。
     * 这里在缩放期间锁住 host 尺寸，停手 120ms 后再放开，循环自然消失。
     */
    useEffect(() => {
        if (!reader.url) {
            return;
        }
        let timer = 0;
        const on_resize = () => {
            const host = host_ref.current;
            if (!host) {
                return;
            }
            if (!timer) {
                const rect = host.getBoundingClientRect();
                host.style.width = `${rect.width}px`;
                host.style.height = `${rect.height}px`;
            }
            clearTimeout(timer);
            timer = window.setTimeout(() => {
                timer = 0;
                host.style.width = "";
                host.style.height = "";
            }, 120);
        };
        window.addEventListener("resize", on_resize);
        return () => {
            window.removeEventListener("resize", on_resize);
            clearTimeout(timer);
        };
    }, [reader.url]);

    return (
        <OfficeEditorShell
            name={reader.name}
            error={error}
            on_close={close}
            extra={<>
                <ActionButton icon={"toc"} title={t("目录")} onClick={() => set_show_toc(!show_toc)}/>
                <ActionButton icon={"chevron_left"} title={t("上一页")}
                              onClick={() => view_ref.current?.goLeft()}/>
                <span className={"ebook-progress"}>{fraction}%</span>
                <ActionButton icon={"chevron_right"} title={t("下一页")}
                              onClick={() => view_ref.current?.goRight()}/>
            </>}
        >
            <div className={"ebook-body"}>
                <div className={"ebook-view"} ref={host_ref}/>
                {loading && <div className={"ebook-loading"}>{t("加载中")}</div>}
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
        </OfficeEditorShell>
    );
}
