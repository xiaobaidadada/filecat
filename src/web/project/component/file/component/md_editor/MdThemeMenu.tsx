import React, {useEffect, useState} from "react";
import {ActionButton} from "../../../../../meta/component/Button";
import {FileMenuItem, OverlayTransparent} from "../../../../../meta/component/Dashboard";
import {md_theme_item} from "../../../../../../common/req/common.pojo";
import {load_md_theme_list} from "./md_theme";
import {get_select_style} from "../../../../util/FunUtil";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai/index";
import {$stroe} from "../../../../util/store";
import {UserBaseInfo} from "../../../../../../common/req/user.req";

/**
 * md 编辑器 Header 的主题切换按钮。
 *
 * 与文件管理右上角「切换目录」按钮完全同款：一个图标按钮，点击在鼠标位置弹出菜单，
 * 当前主题用 get_select_style 标成蓝字加粗，点一项即切换。
 */
export function MdThemeMenu(props: {
    on_change: (id: string) => void,
    // React 内置属性：显式声明才能让调用方直接在 <MdThemeMenu key={...}> 上使用
    key?: React.Key
}) {
    const {t} = useTranslation();
    const [show, set_show] = useState(false);
    const [position, set_position] = useState({x: 0, y: 0});
    const [themes, set_themes] = useState<md_theme_item[]>([]);
    const [user_base_info] = useAtom<UserBaseInfo>($stroe.user_base_info);


    // 打开时才拉列表：按钮上不显示主题名，没必要进编辑器就请求
    useEffect(() => {
        if (!show) {
            return;
        }
        let cancelled = false;
        load_md_theme_list().then(list => {
            if (!cancelled) {
                set_themes(list);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [show]);

    // 选中项用 get_select_style 标成蓝字加粗，与文件管理「切换目录」菜单同款做法。
    // 注意比较的是 props.value（当前主题）与菜单项的 v，前者为 undefined 时谁都标不中，
    // 所以调用方必须传归一化过的字符串（空串表示跟随系统设置）。
    const sel = (text: string, v: string) => (
        <div style={{...get_select_style(v === user_base_info?.user_data?.md_editor_theme)}}>{text}</div>
    );

    return <React.Fragment>
        <ActionButton icon={"palette"} title={t("主题")} onClick={(event) => {
            set_position({x: event.clientX, y: event.clientY});
            set_show(true);
        }}/>
        {show && <OverlayTransparent click={() => set_show(false)} children={
            <FileMenuItem x={position.x} y={position.y}
                          items={[
                              // 值为空表示跟随系统设置里的主题
                              {r: sel(t("follow_sys"), ""), v: ""},
                              ...themes.map(i => ({r: sel(i.id, i.id), v: i.id})),
                          ]}
                          click={(v) => {
                              set_show(false);
                              props.on_change(v);
                          }}/>
        }/>}
    </React.Fragment>;
}
