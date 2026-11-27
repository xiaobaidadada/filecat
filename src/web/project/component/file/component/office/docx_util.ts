import {Docx, openDocx, toUint8Array} from "@office-kit/docx";
import {EditorModel, openEditor} from "@office-kit/docx-editor";

/**
 * docx 文档的解析与写回。
 *
 * 与 xlsx_util 的分工一致：这里只管「字节 ⇄ 模型」的转换，
 * 渲染（HTML）和交互（选区/编辑）交给 DocxBody，外层的下载/上传交给 DocxPane。
 *
 * docx 是一个 OOXML 压缩包（zip），@office-kit/docx 负责解包成文档树，
 * @office-kit/docx-editor 在文档树上提供编辑模型（选区、撤销栈、变更通知）。
 * 两者都不碰 DOM，所以整套逻辑在浏览器里跑没有额外依赖。
 */

/** 打开一份 docx：字节 → 文档 */
export function parse_docx(bytes: Uint8Array): Docx {
    return openDocx(bytes);
}

/** 打开一份 docx 的编辑模型（含选区、撤销栈、变更订阅） */
export function open_docx_editor(bytes: Uint8Array): EditorModel {
    return openEditor(bytes);
}

/** 文档 → 字节，保存时用这个 */
export function docx_to_bytes(doc: Docx): Uint8Array {
    return toUint8Array(doc);
}

/**
 * 取模型里真正要落盘的文档。
 *
 * 用 document 而不是 doc：model.doc 在「编辑页眉/脚注等故事」时会返回一个
 * 只把该故事当正文的视图，拿它保存会把正文写丢。document 永远指向真身。
 */
export function model_to_bytes(model: EditorModel): Uint8Array {
    return toUint8Array(model.document);
}
