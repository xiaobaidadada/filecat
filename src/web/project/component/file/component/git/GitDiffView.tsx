import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from "react-i18next";
import {gitHttp} from "../../../../util/config";
import AceDiffView from "../../../../../meta/component/AceDiffView";

/** 参与对比的其中一版：ref 为 git revision，语义见后端 gitFileContent */
export type DiffRef = "worktree" | "staged" | string;

interface Props {
    /** 仓库目录（相对用户根目录） */
    dir_path: string;
    /** 仓库内相对文件路径 */
    file: string;
    /** 左（旧）版本 ref */
    left_ref: DiffRef;
    /** 右（新）版本 ref */
    right_ref: DiffRef;
    /** 展示模式：单栏内联 / 左右并排 */
    mode?: "unified" | "split";
}

/** 单侧文件内容 */
interface SideContent {
    text: string | null;
    binary: boolean;
    exists: boolean;
}

const EMPTY_SIDE: SideContent = {text: "", binary: false, exists: false};

/**
 * Git 两版本对比视图。
 *
 * 与旧实现的关键区别：不再接收 git diff 原文，而是按左右两个 ref 分别取文件全文，
 * 交给 Ace 官方 diff 视图渲染 —— 这样能拿到字符级差异高亮与同步滚动，
 * 效果与 JetBrains 的 diff 面板一致。二进制与超大文件直接提示无法比较。
 */
export default function GitDiffView({dir_path, file, left_ref, right_ref, mode = "unified"}: Props) {
    const {t} = useTranslation();
    const [left, setLeft] = useState<SideContent>(EMPTY_SIDE);
    const [right, setRight] = useState<SideContent>(EMPTY_SIDE);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // 用序号守卫并发请求：切换文件时旧请求可能后返回，覆盖掉新内容
    const seq_ref = useRef(0);

    useEffect(() => {
        const seq = ++seq_ref.current;
        setLoading(true);
        setError('');
        const fetch_side = (ref: DiffRef) => gitHttp.post('file_content', {path: dir_path, file, ref});
        Promise.all([fetch_side(left_ref), fetch_side(right_ref)])
            .then(([a, b]) => {
                if (seq !== seq_ref.current) return;
                setLeft(a.code === 0 ? a.data : EMPTY_SIDE);
                setRight(b.code === 0 ? b.data : EMPTY_SIDE);
            })
            .catch(e => {
                if (seq !== seq_ref.current) return;
                setError(typeof e === "string" ? e : e?.message || "");
                setLeft(EMPTY_SIDE);
                setRight(EMPTY_SIDE);
            })
            .finally(() => {
                if (seq === seq_ref.current) setLoading(false);
            });
    }, [dir_path, file, left_ref, right_ref]);

    if (loading) {
        return <div className="git-diff-empty"><span>{t('加载中')}</span></div>;
    }
    if (error) {
        return <div className="git-diff-empty"><span>{error}</span></div>;
    }
    // 二进制或超出体积上限的文件无法做文本比较
    if (left.binary || right.binary) {
        return <div className="git-diff-empty"><span>{t('二进制文件无法比较')}</span></div>;
    }
    // 两侧内容一致时没有可展示的差异
    if (left.text === right.text) {
        return <div className="git-diff-empty"><span>{t('无差异')}</span></div>;
    }
    return (
        <AceDiffView
            valueA={left.text ?? ""}
            valueB={right.text ?? ""}
            mode={mode === "split" ? "split" : "inline"}
            filename={file}
        />
    );
}
