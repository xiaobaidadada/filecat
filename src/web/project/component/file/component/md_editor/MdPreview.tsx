import React, {useState} from "react";
import {useAtom} from "jotai";
import {$stroe} from "../../../../util/store";
import MdWysiwygEditor from "./MdWysiwygEditor";
import {apply_md_editor_setting} from "./MdEditorSetting";
import {MD_THEME_PREVIEW_DEFAULT} from "./md_theme_template";
import {md_editor_setting_pojo} from "../../../../../../common/req/common.pojo";

interface Props {
    /** 编辑器外观变量，设置页用来把当前输入值实时套到预览上；不传则用 CSS 里的默认值 */
    setting?: Partial<md_editor_setting_pojo>;
    className?: string;
}

/**
 * md 预览：用真实的 md 编辑器渲染，因此预览效果与实际编辑器完全一致，且可以直接编辑。
 * 主题编辑页与编辑器设置页共用，两处的差异只有容器类名和是否传入外观变量。
 */
export default React.memo(function MdPreview(props: Props) {
    // 优先用最近打开过的 md 正文，页面没打开过文档时退回内置示例（覆盖所有 markdown 元素，
    // 便于观察主题与外观设置在各类元素上的效果）。预览内容改动不保存，离开页面即丢。
    const [last_context] = useAtom($stroe.md_editor_last_context);
    const [value] = useState(last_context?.trim() ? last_context : MD_THEME_PREVIEW_DEFAULT);

    return <div className={props.className}
                ref={(el) => props.setting && apply_md_editor_setting(el, props.setting)}>
        {/* 结构与真实编辑器保持一致（scroll 是整页底色/滚动的载体），
            主题写在 .md-editor-scroll 上的背景等规则在预览里才能同样生效 */}
        <div className={"md-editor-scroll"}>
            <div className={"md-editor-sheet"}>
                <MdWysiwygEditor value={value}/>
            </div>
        </div>
    </div>;
});
