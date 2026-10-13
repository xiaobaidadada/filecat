import React from 'react';
import BrowserProxyTargets from "../setting/BrowserProxyTargets";

/**
 * 浏览器代理页面（端口模式）。
 *
 * 页面主体即「网页代理目标」列表：每个目标对应一个独立端口的代理入口。
 * 打开目标通过 新标签页 / 当前窗口 跳转到 http://<当前主机>:<端口>/，
 * 不再使用页内 iframe 预览，也不再使用旧的标签导航（NavIndexContainer）。
 *
 * 权限：查看/打开由 UserAuth.browser_proxy 控制（菜单可见性），
 *      新增/编辑/删除由 UserAuth.browser_proxy_edit 控制（按钮显隐 + 后端强制校验）。
 */
export function BrowserProxy(props) {
    return <BrowserProxyTargets/>;
}
