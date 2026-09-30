import {CheckUtil} from "./CheckUtil";
import {md_editor_setting_pojo} from "./req/common.pojo";

/**
 * md 编辑器设置的字段校验表 —— 前后端唯一一份，禁止各写一份。
 *
 * 字段名 -> 校验器。校验器返回校验后的值，返回 null 表示非法。
 * 前端的设置页保存前用它校验并提示，后端的 set_md_editor_setting 用它校验并落盘。
 * 表里没配规则的字段不校验，原样保存（新增字段不会因为漏配而存不进去）。
 *
 * 校验规则本身不在这里，都在 CheckUtil 里按数据类型定义，这里只是把字段挂到类型上。
 */
export const MD_EDITOR_SETTING_FIELDS: Record<
    keyof md_editor_setting_pojo,
    (raw: any) => string | number | null
> = {
    content_max_width: CheckUtil.size,
    content_padding: CheckUtil.size,
    font_size: CheckUtil.size,
    line_height: (v) => CheckUtil.size(v, true),
    // 主题名会被当作文件名（<主题名>.css）用，走文件名校验
    theme: CheckUtil.filename,
    auto_save_interval: CheckUtil.uint,
};
