import React, {useEffect, useState} from 'react'
import {InputTextIcon} from "../../../meta/component/Input";
import {ActionButton} from "../../../meta/component/Button";
import {HeaderPortal} from "../../../meta/component/HeaderPortal";
import {FullScreenDiv} from "../../../meta/component/Dashboard";
import {netHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NavIndexContainer} from "../navindex/component/NavIndexContainer";
import {useTranslation} from "react-i18next";
import {$stroe} from "../../util/store";
import {useAtom} from 'jotai';
import {use_auth_check} from "../../util/store.util";
import {UserAuth} from "../../../../common/req/user.req";
import {NotyFail} from "../../util/noty";
import {Global} from "../../util/global";

/** 代理路径前缀（与后端 BrowserProxy.PROXY_PATH 对应） */
const PROXY_PATH = "browser_proxy";

/** 刷新后恢复当前页用的 sessionStorage key */
const STORE_KEY = "browser_proxy_url";

/**
 * 把目标地址转换成同源的代理地址。
 * 例：https://example.com/a?b=1
 *  → /filecat/browser_proxy/{token}/https/example.com/a?b=1
 *
 * 同源是这套方案的核心：不起新端口，iframe 与外层同域，
 * cookie/localStorage 正常，刷新外层也能用页面地址还原。
 *
 * token 放路径段而不是 query：iframe 内的请求由浏览器原生发起，
 * 带不上 Authorization 头，放路径段后 <base> 能天然覆盖所有相对路径。
 */
function to_proxy_url(url: string): string {
    const u = new URL(url);
    const base = Global.base_url || "";
    const path = u.pathname + u.search + u.hash;
    const token = encodeURIComponent(get_token());
    return `${base}/${PROXY_PATH}/${token}/${u.protocol.replace(":", "")}/${u.host}${path || "/"}`;
}

/** 取当前登录 token */
function get_token(): string {
    try {
        return localStorage.getItem("token") || "";
    } catch (e) {
        return "";
    }
}

/**
 * 从代理地址反推目标地址，用于地址栏回显。
 * 地址结构：/{PROXY_PATH}/{token}/{proto}/{host}{path}
 * 取不到（非代理地址）返回空串。
 */
function to_target_url(proxy_url: string): string {
    const marker = `/${PROXY_PATH}/`;
    const i = proxy_url.indexOf(marker);
    if (i === -1) {
        return "";
    }
    let rest = proxy_url.slice(i + marker.length);
    const hash_i = rest.indexOf("#");
    const suffix = hash_i === -1 ? "" : rest.slice(hash_i);
    if (hash_i !== -1) {
        rest = rest.slice(0, hash_i);
    }
    // 跳过 token 段
    const t_slash = rest.indexOf("/");
    if (t_slash === -1) {
        return "";
    }
    rest = rest.slice(t_slash + 1);
    // 前两段固定是协议和域名
    const first_slash = rest.indexOf("/");
    const proto = first_slash === -1 ? rest : rest.slice(0, first_slash);
    const after_proto = first_slash === -1 ? "" : rest.slice(first_slash + 1);
    const second_slash = after_proto.indexOf("/");
    const host = second_slash === -1 ? after_proto : after_proto.slice(0, second_slash);
    const path = second_slash === -1 ? "/" : after_proto.slice(second_slash);
    if (!proto || !host) {
        return "";
    }
    return `${proto}://${host}${path}${suffix}`;
}

export function BrowserProxy(props) {
    const {t} = useTranslation();
    const [headerMin, setHeaderMin] = useAtom($stroe.header_min);

    const [showUrl, setshowUrl] = useState('');
    /** 当前 iframe 的代理地址；刷新后从 sessionStorage 恢复，实现「刷新不丢」 */
    const [gourl, setGourl] = useState<string>(() => {
        try {
            return sessionStorage.getItem(STORE_KEY) || "";
        } catch {
            return "";
        }
    });
    const [fullScreen, setFullScreen] = useState(false);
    const {check_user_auth} = use_auth_check();
    const iframe_ref = React.useRef<HTMLIFrameElement>(null);

    /** 记住当前页，刷新后能回到同一页 */
    useEffect(() => {
        try {
            if (gourl) {
                sessionStorage.setItem(STORE_KEY, gourl);
            } else {
                sessionStorage.removeItem(STORE_KEY);
            }
        } catch (e) {
            // 隐私模式下不可用，忽略
        }
    }, [gourl]);

    /** 恢复上次地址时，把目标地址回显到输入框 */
    useEffect(() => {
        if (gourl && !showUrl) {
            setshowUrl(to_target_url(gourl));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const close = () => {
        setGourl("");
        setFullScreen(false);
        setshowUrl("");
        try {
            sessionStorage.removeItem(STORE_KEY);
        } catch (e) {
            // ignore
        }
    }

    /** 打开某个地址（走同源代理，不再申请端口） */
    const go = (url?: string) => {
        const target = typeof url === "string" ? url : showUrl;
        if (!target.startsWith("http")) {
            NotyFail(t("must start with http[s]://"));
            return;
        }
        let proxy_url: string;
        try {
            proxy_url = to_proxy_url(target);
        } catch (e) {
            NotyFail(t("地址格式不正确"));
            return;
        }
        setGourl(proxy_url);
    }

    /** 回到目标站首页 */
    const go_home = () => {
        const target = to_target_url(gourl);
        if (!target) {
            return;
        }
        try {
            const u = new URL(target);
            setGourl(to_proxy_url(`${u.protocol}//${u.host}/`));
        } catch (e) {
            // ignore
        }
    }

    /** 刷新 iframe 内容（保留当前所在页） */
    const refresh_iframe = () => {
        try {
            iframe_ref.current?.contentWindow?.location.reload();
        } catch (e) {
            // 同源下正常可读；异常时用 key 强制重建
            setGourl((v) => v);
        }
    }

    /**
     * iframe 加载完成后同步地址栏显示。
     * 因为 iframe 与外层同源，可以直接读到它当前的真实地址。
     */
    const sync_address = () => {
        try {
            const href = iframe_ref.current?.contentWindow?.location.href;
            if (!href) {
                return;
            }
            const target = to_target_url(href);
            if (target) {
                setshowUrl(target);
                setGourl(href);
            }
        } catch (e) {
            // 跨域时读不到，忽略
        }
    }

    const getItems = async () => {
        const result = await netHttp.get("tag");
        if (result.code === RCode.Success) {
            return result.data;
        }
        return [];
    }
    const saveItems = async (items) => {
        const rsq = await netHttp.post("tag/save", items);
        if (rsq.code !== RCode.Success) {
            NotyFail('网络错误')
        }
    }
    const clickItem = async (item: { url?: string, name?: string }) => {
        setshowUrl(item.url);
        go(item.url);
    }

    const fullscreen = () => {
        setFullScreen(!fullScreen)
        setHeaderMin(!fullScreen);
    }

    return <div>
        <HeaderPortal position={"right"}>
            <InputTextIcon placeholder={t("要代理的url")} icon={"link"} value={showUrl} handleInputChange={(v) => {
                setshowUrl(v);
            }}/>
            <ActionButton icon={"play_arrow"} title={t("开始代理")} onClick={() => go()}/>
            {gourl && <ActionButton icon={"home"} title={t("首页")} onClick={go_home}/>}
            {gourl && <ActionButton icon={"refresh"} title={t("刷新")} onClick={refresh_iframe}/>}
            <ActionButton icon={"fullscreen"} title={t("全屏")} onClick={fullscreen}/>
            <ActionButton icon={"close"} title={t(t("关闭"))} onClick={close}/>
        </HeaderPortal>

        <FullScreenDiv isFull={fullScreen}>
            <div id="browser">
                {!gourl &&
                    <NavIndexContainer have_auth_edit={check_user_auth(UserAuth.browser_proxy_tag_update)}
                                       getItems={getItems} save={saveItems} clickItem={clickItem}
                                       items={[{key: "name", preName: t("名字")}, {
                                           key: "url",
                                           preName: "url"
                                       }, {key: "color", preName: "color"}]}/>}
                {gourl && <iframe id="webview" ref={iframe_ref} src={gourl} onLoad={sync_address}></iframe>}
            </div>
        </FullScreenDiv>
    </div>
}
