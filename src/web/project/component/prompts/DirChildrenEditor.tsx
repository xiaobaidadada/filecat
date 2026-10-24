import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Table} from "../../../meta/component/Table";
import {InputText} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";
import {CardFull} from "../../../meta/component/Card";
import {FileSettingItem} from "../../../../common/req/setting.req";

/**
 * 子目录编辑弹框内容，骨架与「文件夹路径」卡片保持一致。
 * 只有 目录 / 备注 两列，点确定时通过 on_confirm 把结果交回父组件。
 */
export function DirChildrenEditor(props: {
    children_list?: FileSettingItem[]
    on_confirm: (list: FileSettingItem[]) => void
    on_cancel: () => void
}) {
    const {t} = useTranslation();
    const [children, set_children] = useState<FileSettingItem[]>(
        (props.children_list ?? []).map(v => ({path: v.path, note: v.note} as FileSettingItem))
    );
    const headers = [t("编号"),t("目录"), t("备注")];
    const add = () => {
        set_children([...children, {path: "", note: ""} as FileSettingItem]);
    };
    useEffect(() => {
        if (!children?.length) {
            add()
        }
    })
    const save = () => {
        props.on_confirm(children.filter(v => v.path));
    };
    return (<CardFull
        self_title={<span className={" div-row "}><h2>{t("sub_dir")}</h2></span>}
        rightTopCom={<div>
            <ActionButton icon={"add"} title={t("添加")} onClick={add}/>
            <ActionButton icon={"save"} title={t("保存")} onClick={save}/>
            <ActionButton icon={"close"} title={t("取消")} onClick={props.on_cancel}/>
        </div>}>
        <Table headers={headers} rows={children.map((child, ci) => [
            <span>{ci}</span>,
            <InputText value={child.path} handleInputChange={(value) => {
                child.path = value;
            }} no_border={true}/>,
            <InputText value={child.note} handleInputChange={(value) => {
                child.note = value;
            }} no_border={true}/>,
            <div>
                <ActionButton icon={"delete"} title={t("删除")} onClick={() => {
                    set_children(children.filter((_, i) => i !== ci));
                }}/>
            </div>,
        ])} width={"10rem"}/>
    </CardFull>);
}
