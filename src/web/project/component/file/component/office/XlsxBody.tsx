import React, {useCallback, useEffect, useRef, useState} from "react";
import {CellStyle, parse_xlsx, SheetView, write_xlsx} from "./xlsx_util";

interface Props {
    bytes: Uint8Array;
    on_change: (dirty: boolean) => void;
    bind_save: (fn: () => Promise<Uint8Array>) => void;
}

const HEAD_W = 46;
const HEAD_H = 24;

/**
 * 表格网格：按源文件的真实列宽/行高排布，虚拟滚动只渲染视口内的单元格。
 * 只负责展示与改值；样式与条件格式由 xlsx_util 在写回时保留。
 */
export default function XlsxBody(props: Props) {
    const {bytes, on_change, bind_save} = props;
    const [sheets, set_sheets] = useState<SheetView[]>([]);
    const [active, set_active] = useState(0);
    const [, force] = useState(0);
    const [error, set_error] = useState("");
    const dirty_ref = useRef(false);
    const scroll_ref = useRef<HTMLDivElement>(null);
    // 当前视口内的行/列区间（0 基，左闭右开）
    const [range, set_range] = useState({r0: 0, r1: 40, c0: 0, c1: 20});

    useEffect(() => {
        let alive = true;
        set_error("");
        parse_xlsx(bytes)
            .then((list) => alive && set_sheets(list))
            .catch((e) => alive && set_error(String(e?.message ?? e)));
        return () => {
            alive = false;
        };
    }, [bytes]);

    const mark_dirty = useCallback(() => {
        if (!dirty_ref.current) {
            dirty_ref.current = true;
            on_change(true);
        }
    }, [on_change]);

    useEffect(() => {
        bind_save(async () => {
            const out = await write_xlsx(bytes, sheets);
            dirty_ref.current = false;
            on_change(false);
            return out;
        });
    }, [sheets, bytes, bind_save, on_change]);

    const sheet = sheets[active];

    // 前缀和：把行列下标换算成像素偏移，支持虚拟滚动
    const {col_x, row_y, total_w, total_h} = React.useMemo(() => {
        const cols = sheet?.col_widths ?? [];
        const rows = sheet?.row_heights ?? [];
        const cx: number[] = [0];
        cols.forEach((w, i) => cx.push(cx[i] + (sheet?.hidden_rows.has(i) ? 0 : w)));
        const ry: number[] = [0];
        rows.forEach((h, i) => ry.push(ry[i] + h));
        return {col_x: cx, row_y: ry, total_w: cx[cx.length - 1] ?? 0, total_h: ry[ry.length - 1] ?? 0};
    }, [sheet]);

    // 用二分找视口起点，避免遍历上千行
    const find_index = (arr: number[], px: number) => {
        let lo = 0;
        let hi = arr.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < px) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    };

    const refresh_range = useCallback(() => {
        const el = scroll_ref.current;
        if (!el || !col_x.length) {
            return;
        }
        const c0 = Math.max(0, find_index(col_x, el.scrollLeft) - 1);
        const r0 = Math.max(0, find_index(row_y, el.scrollTop) - 1);
        set_range({
            c0,
            c1: Math.min(col_x.length - 1, find_index(col_x, el.scrollLeft + el.clientWidth) + 2),
            r0,
            r1: Math.min(row_y.length - 1, find_index(row_y, el.scrollTop + el.clientHeight) + 2),
        });
    }, [col_x, row_y]);

    useEffect(() => {
        refresh_range();
    }, [sheet, refresh_range]);

    const set_value = (r: number, c: number, v: string) => {
        const target = sheets[active];
        if (!target) {
            return;
        }
        target.values[r][c] = v === "" ? null : v;
        mark_dirty();
        force((n) => n + 1);
    };

    if (error) {
        return <div className="office-editor__tip office-editor__tip--error">{error}</div>;
    }
    if (!sheets.length) {
        return <div className="office-editor__tip">解析中…</div>;
    }

    const rows = sheet?.values ?? [];
    const max_r = row_y.length - 1;
    const max_c = col_x.length - 1;

    // 合并单元格：被覆盖的格子不渲染（由左上角那个跨格显示）
    const covered = new Set<string>();
    sheet.merges.forEach(([r1, c1, r2, c2]) => {
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
                if (r !== r1 || c !== c1) {
                    covered.add(`${r}_${c}`);
                }
            }
        }
    });

    // 右侧格子是否「空」：没有值也没有底色，Excel 才会让当前格文本溢出过去
    const is_empty = (r: number, c: number) => {
        const v = rows[r]?.[c];
        return (v === null || v === undefined || v === "") && !sheet.styles.get(`${r}_${c}`)?.bg;
    };

    return (
        <div className="xlsx-body">
            <div className="xlsx-tabs">
                {sheets.map((s, i) => (
                    <div
                        key={s.title + i}
                        className={`xlsx-tab ${i === active ? "xlsx-tab--active" : ""}`}
                        onClick={() => {
                            set_active(i);
                            if (scroll_ref.current) {
                                scroll_ref.current.scrollTop = 0;
                                scroll_ref.current.scrollLeft = 0;
                            }
                        }}
                    >
                        {s.title}
                    </div>
                ))}
            </div>
            <div className="xlsx-scroll" ref={scroll_ref} onScroll={refresh_range}>
                <div className="xlsx-grid" style={{width: HEAD_W + total_w, height: HEAD_H + total_h}}>
                    {/* 列头 */}
                    {Array.from({length: Math.max(0, range.c1 - range.c0)}).map((_, i) => {
                        const c = range.c0 + i;
                        return (
                            <div
                                key={"ch" + c}
                                className="xlsx-head"
                                style={{left: HEAD_W + col_x[c], top: 0, width: col_x[c + 1] - col_x[c], height: HEAD_H}}
                            >
                                {col_name(c)}
                            </div>
                        );
                    })}
                    {/* 行头 + 单元格 */}
                    {Array.from({length: Math.max(0, range.r1 - range.r0)}).map((_, ri) => {
                        const r = range.r0 + ri;
                        return (
                            <React.Fragment key={r}>
                                <div
                                    className="xlsx-head xlsx-head--row"
                                    style={{left: 0, top: HEAD_H + row_y[r], width: HEAD_W, height: row_y[r + 1] - row_y[r]}}
                                >
                                    {r + 1}
                                </div>
                                {Array.from({length: Math.max(0, range.c1 - range.c0)}).map((_, ci) => {
                                    const c = range.c0 + ci;
                                    if (covered.has(`${r}_${c}`)) {
                                        return null;
                                    }
                                    // 合并区域由左上角跨格渲染
                                    const merge = sheet.merges.find((m) => m[0] === r && m[1] === c);
                                    const w = merge ? col_x[merge[3] + 1] - col_x[merge[1]] : col_x[c + 1] - col_x[c];
                                    const h = merge ? row_y[merge[2] + 1] - row_y[merge[0]] : row_y[r + 1] - row_y[r];
                                    return (
                                        <Cell
                                            key={c}
                                            value={rows[r]?.[c] ?? ""}
                                            cell_style={sheet.styles.get(`${r}_${c}`)}
                                            spillable={is_empty(r, c + 1)}
                                            style={{
                                                left: HEAD_W + col_x[c],
                                                top: HEAD_H + row_y[r],
                                                width: w,
                                                height: h,
                                                zIndex: merge ? 2 : 1,
                                            }}
                                            on_change={(v) => set_value(r, c, v)}
                                        />
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** 单格：双击进入编辑 */
function Cell(props: {
    key?: any;
    value: string | null;
    cell_style?: CellStyle;
    style: React.CSSProperties;
    /** 右侧是否为空（决定长文本能否溢出显示） */
    spillable?: boolean;
    on_change: (v: string) => void;
}) {
    const {value, cell_style, style, spillable, on_change} = props;
    const [editing, set_editing] = useState(false);
    const [draft, set_draft] = useState("");
    const input_ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (editing && input_ref.current) {
            input_ref.current.focus();
            input_ref.current.select();
        }
    }, [editing]);

    const commit = () => {
        set_editing(false);
        if (draft !== (value ?? "")) {
            on_change(draft);
        }
    };

    const cs: React.CSSProperties = {};
    if (cell_style?.bg) {
        cs.backgroundColor = cell_style.bg;
    }
    if (cell_style?.color) {
        cs.color = cell_style.color;
    }
    if (cell_style?.bold) {
        cs.fontWeight = 600;
    }
    if (cell_style?.italic) {
        cs.fontStyle = "italic";
    }
    // 字号按 pt 精确换算（1pt = 4/3 px），不随外层 em 缩放
    if (cell_style?.fontSize) {
        cs.fontSize = `${Math.round((cell_style.fontSize * 4) / 3 * 10) / 10}px`;
    }
    if (cell_style?.fontFamily) {
        // 内联样式需要 !important 才压得过全局字体规则
        cs.fontFamily = `"${cell_style.fontFamily}", "PingFang SC", sans-serif`;
    }
    if (cell_style?.underline) {
        cs.textDecoration = "underline";
    }
    if (cell_style?.strike) {
        cs.textDecoration = cs.textDecoration ? `${cs.textDecoration} line-through` : "line-through";
    }
    if (cell_style?.align) {
        cs.textAlign = cell_style.align;
        cs.justifyContent = cell_style.align === "center" ? "center" : cell_style.align === "right" ? "flex-end" : "flex-start";
    }
    if (cell_style?.valign) {
        cs.alignItems = cell_style.valign === "middle" ? "center" : cell_style.valign === "bottom" ? "flex-end" : "flex-start";
    }
    if (cell_style?.wrap) {
        cs.whiteSpace = "pre-wrap";
    }
    if (cell_style?.indent) {
        cs.paddingLeft = `${0.35 + cell_style.indent * 1.4}em`;
    }

    return (
        <div
            className={`xlsx-cell ${cell_style?.wrap ? "xlsx-cell--wrap" : ""} ${spillable ? "xlsx-cell--spill" : ""}`}
            style={{...style, ...cs, ["--cell-h" as any]: cell_style?.wrap ? "1.4" : `${(style.height as number) - 1}px`}}
            onDoubleClick={() => {
                set_draft(value ?? "");
                set_editing(true);
            }}
        >
            {editing ? (
                <textarea
                    ref={input_ref}
                    className="xlsx-cell__input"
                    value={draft}
                    onChange={(e) => set_draft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            commit();
                        } else if (e.key === "Escape") {
                            set_editing(false);
                        }
                    }}
                />
            ) : cell_style?.runs ? (
                // 富文本：按段渲染，保留局部颜色
                <span>
                    {cell_style.runs.map((r, i) => (
                        <span key={i} style={r.color ? {color: r.color} : undefined}>
                            {r.text}
                        </span>
                    ))}
                </span>
            ) : (
                value
            )}
        </div>
    );
}

/** 0 基列号转 A/B/AA */
function col_name(c: number): string {
    let s = "";
    let n = c + 1;
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}
