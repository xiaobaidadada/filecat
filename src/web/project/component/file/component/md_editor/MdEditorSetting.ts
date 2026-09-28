import {
    MD_EDITOR_SETTING_DEFAULT,
    md_editor_setting_pojo
} from "../../../../../../common/req/common.pojo";
import {settingHttp} from "../../../../util/config";
import {RCode} from "../../../../../../common/Result.pojo";

/**
 * md 编辑器全局设置的共享常量与工具方法。
 *
 * 真正的设置界面是独立页面 MdEditorSettingPage（路由 /md_editor_setting_page），
 * 这里只放编辑器运行时也要用到的部分：拉取配置、应用配置。
 *
 * 尺寸类字段一律是完整的 CSS 值字符串（如 "10px"、"3rem"、"80%"、"1.8"），
 * 由用户直接输入，这里不做任何换算，原样塞进 CSS 变量。
 *
 * 默认值定义在 common/req/common.pojo.ts 的 MD_EDITOR_SETTING_DEFAULT ——
 * 前后端共用同一份，这里只做转出，方便本目录内的组件引用。
 */
export {MD_EDITOR_SETTING_DEFAULT};

/**
 * 拉取全局 md 编辑器设置。任何用户都能读（只读，接口无敏感信息）。
 * 失败时回落到默认值，不阻塞编辑器打开。
 */
export async function load_md_editor_setting(): Promise<md_editor_setting_pojo> {
    try {
        const rsq = await settingHttp.get("md_editor_setting/get");
        return {...MD_EDITOR_SETTING_DEFAULT, ...(rsq?.data ?? {})};
    } catch (e) {
        return {...MD_EDITOR_SETTING_DEFAULT};
    }
}

/**
 * 保存全局设置。需要 UserAuth.md_editor_setting 权限。
 * @returns 保存成功返回后端规范化后的配置，失败返回 null
 */
export async function save_md_editor_setting(body: Partial<md_editor_setting_pojo>): Promise<md_editor_setting_pojo | null> {
    const rsq = await settingHttp.post("md_editor_setting/save", body);
    if (rsq?.code !== RCode.Success) {
        return null;
    }
    return {...MD_EDITOR_SETTING_DEFAULT, ...(rsq.data ?? body)};
}

/**
 * 把设置写进 CSS 变量，挂到容器元素上。CSS 里所有相关尺寸都读这些变量，
 * 所以这里改完立即生效，不需要重渲染编辑器。
 */
export function apply_md_editor_setting(el: HTMLElement | null, s: md_editor_setting_pojo) {
    if (!el) {
        return;
    }
    // 值已经是完整的 CSS 值，直接用
    el.style.setProperty("--md-editor-max-width", s.content_max_width);
    el.style.setProperty("--md-editor-padding", s.content_padding);
    el.style.setProperty("--md-editor-font-size", s.font_size);
    el.style.setProperty("--md-editor-line-height", s.line_height);
}
