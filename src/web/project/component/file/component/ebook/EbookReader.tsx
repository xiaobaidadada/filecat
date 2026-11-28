import React, {useEffect, useRef, useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import OfficeEditorShell from "../office/OfficeEditorShell";
import {ActionButton} from "../../../../../meta/component/Button";
import {useTranslation} from "react-i18next";
import {Http} from "../../../../util/http";
import "./ebook.css";

/** foliate-js 注册的 <foliate-view> 是运行时自定义元素，React 没有它的类型 */
const FoliateView = "foliate-view" as unknown as React.ElementType;

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
        book?: { toc?: any[], metadata?: { title?: unknown } },
    }>();
    const [loading, set_loading] = useState(true);
    const [error, set_error] = useState("");
    const [toc, set_toc] = useState<{ label: string, href: string, depth: number }[]>([]);
    const [show_toc, set_show_toc] = useState(false);
    /** 0~100 的阅读进度 */
    const [fraction, set_fraction] = useState(0);

    const close = () => {
        const fn = reader.close;
        setReader({});
        fn?.();
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
            // url 已带 baseUrl 与 token，走项目统一的字节下载封装
            const bytes = await Http.get_bytes_url(reader.url as string);
            const name = reader.name ?? "book.epub";
            const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
            const file = new File([bytes], name, {type: MIME_MAP[ext] ?? "application/octet-stream"});
            if (!alive || !view_ref.current) {
                return;
            }
            await view_ref.current.open(file);
            if (!alive) {
                return;
            }
            // open() 只解析不渲染，init() 才会定位并渲染第一页
            await view_ref.current.init({showTextStart: true});
            if (!alive) {
                return;
            }
            set_toc(flatten_toc(view_ref.current.book?.toc));
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
    }, [reader.url]);

    /** 翻页后同步阅读进度 */
    useEffect(() => {
        const view = view_ref.current;
        if (!view) {
            return;
        }
        const on_relocate = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (typeof detail?.fraction === "number") {
                set_fraction(Math.round(detail.fraction * 100));
            }
        };
        view.addEventListener("relocate", on_relocate);
        return () => {
            view.removeEventListener("relocate", on_relocate);
        };
    }, []);

    /**
     * foliate 的 paginator 在 ResizeObserver 里重排，浏览器会报
     * "ResizeObserver loop completed with undelivered notifications"。
     * 这是无害警告，但 dev 模式下 webpack 会把它当错误弹全屏遮罩挡住页面，
     * 这里在捕获阶段拦掉这一条，不影响其他错误。
     */
    useEffect(() => {
        const is_ro_loop = (msg?: string) => !!msg?.includes("ResizeObserver loop");
        const on_error = (e: ErrorEvent) => {
            if (is_ro_loop(e.message)) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        window.addEventListener("error", on_error, true);
        return () => window.removeEventListener("error", on_error, true);
    }, []);

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
                <div className={"ebook-view"}>
                    {/* view 必须始终在 DOM 里，open() 依赖它的实例 */}
                    <FoliateView ref={view_ref as any}/>
                </div>
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
