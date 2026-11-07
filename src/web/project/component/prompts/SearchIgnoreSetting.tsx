import React, {useContext, useState} from "react";
import {useAtom} from "jotai";
import {useTranslation} from "react-i18next";
import {$stroe} from "../../util/store";
import {userHttp} from "../../util/config";
import {Http_controller_router} from "../../../../common/req/http_controller_router";
import {RCode} from "../../../../common/Result.pojo";
import {InputText} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";
import {GlobalContext} from "../../GlobalProvider";

/**
 * 搜索忽略名字设置页。
 * 接管整个弹窗（main_context_div），左侧是规则列表，右侧是编辑区，
 * 保存后写回当前用户的 user_data，下次打开搜索弹窗自动带上。
 */
export function SearchIgnoreSetting(props: { on_back: () => void }) {
    const {t} = useTranslation();
    const {initUserInfo} = useContext(GlobalContext);
    const [user_base_info] = useAtom($stroe.user_base_info);
    const saved = user_base_info?.user_data?.search_exclude_names;
    const [names, set_names] = useState<string[]>(Array.isArray(saved) ? [...saved] : []);
    const [new_name, set_new_name] = useState("");
    const [saving, set_saving] = useState(false);

    const add = () => {
        const v = new_name.trim();
        if (!v || names.includes(v)) return;
        set_names([...names, v]);
        set_new_name("");
    };

    const remove = (n: string) => set_names(names.filter(x => x !== n));

    const save = async () => {
        if (saving) return;
        set_saving(true);
        const rsp = await userHttp.post(Http_controller_router.user_save_private_attr, {
            is_search_exclude: true,
            search_exclude_names: names,
        });
        set_saving(false);
        if (rsp?.code !== RCode.Success) return;
        await initUserInfo();
        props.on_back();
    };

    return <div className="search-ignore-setting">
        <div className="search-ignore-setting__desc">{t("按名字忽略说明")}</div>

        <div className="search-ignore-setting__add">
            <InputText value={new_name}
                       placeholder={t("如 node_modules")}
                       handleInputChange={v => set_new_name(v)}
                       handlerEnter={add}
                       width={"20em"}/>
            <ActionButton icon={"add"} title={t("添加")} onClick={add}/>
        </div>

        <div className="search-ignore-setting__list">
            {names.length === 0 && <div className="search-ignore-setting__empty">{t("暂无")}</div>}
            {names.map(n => <div className="search-ignore-setting__item" key={n}>
                <span className="material-symbols-outlined">block</span>
                <span className="search-ignore-setting__item-name">{n}</span>
                <ActionButton icon={"delete"} title={t("删除")} onClick={() => remove(n)}/>
            </div>)}
        </div>

        <div className="div-row div-row--end search-ignore-setting__footer">
            <ActionButton icon={"arrow_back"} title={t("返回")} onClick={props.on_back}/>
            <ActionButton icon={"save"} title={t("保存")} onClick={save}/>
        </div>
    </div>;
}
