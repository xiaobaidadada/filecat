import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useNavigate} from "react-router-dom";
import {useAtom} from "jotai";
import Header from "../../../meta/component/Header";
import {ActionButton} from "../../../meta/component/Button";
import {Column, Dashboard, FullScreenContext, FullScreenDiv, Row} from "../../../meta/component/Dashboard";
import {CardFull} from "../../../meta/component/Card";
import {InputText, Select} from "../../../meta/component/Input";
import {$stroe} from "../../util/store";
import {sysHttp} from "../../util/config";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail, NotySuccess} from "../../util/noty";

/**
 * Docker 配置设置独立页面（路由访问）
 *
 * 以字段表单方式可视化修改 docker daemon 的代理配置（/etc/docker/daemon.json 的 "proxies" 字段，
 * 用于 docker 拉取镜像/构建时走指定的 HTTP 代理）。保存后可选择立即重启 docker 使配置生效。
 */
export default function DockerSetting() {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const [show_confirm, set_show_confirm] = useAtom($stroe.confirm);

    const [http_proxy, set_http_proxy] = useState("");
    const [https_proxy, set_https_proxy] = useState("");
    const [no_proxy, set_no_proxy] = useState("");
    // daemon.json 常用字段：镜像加速 / 不安全仓库（数组，表单内用逗号或换行分隔）
    const [registry_mirrors, set_registry_mirrors] = useState("");
    const [insecure_registries, set_insecure_registries] = useState("");
    const [debug, set_debug] = useState(false);
    // daemon.json 存储 / 日志 / 网络安全等关键字段
    const [data_root, set_data_root] = useState("");
    const [storage_driver, set_storage_driver] = useState("");
    const [log_driver, set_log_driver] = useState("");
    const [iptables, set_iptables] = useState(true);
    const [live_restore, set_live_restore] = useState(false);

    // 初次加载：读取当前 docker 配置
    useEffect(() => {
        (async () => {
            const rsp = await sysHttp.get("docker/config");
            if (rsp?.code !== RCode.Success) return;
            const cfg = rsp.data ?? {};
            set_http_proxy(cfg.http_proxy ?? "");
            set_https_proxy(cfg.https_proxy ?? "");
            set_no_proxy(cfg.no_proxy ?? "");
            set_registry_mirrors((cfg.registry_mirrors || []).join(","));
            set_insecure_registries((cfg.insecure_registries || []).join(","));
            set_debug(!!cfg.debug);
            set_data_root(cfg.data_root ?? "");
            set_storage_driver(cfg.storage_driver ?? "");
            set_log_driver(cfg.log_driver ?? "");
            set_iptables(cfg.iptables ?? true);
            set_live_restore(!!cfg.live_restore);
        })();
    }, []);

    // 保存配置（对数组字段做逗号/换行拆分），二次确认是否重启 docker
    const save = async () => {
        const splitList = (s: string) => s.split(/[\n,，]/).map(v => v.trim()).filter(Boolean);
        // 先保存配置
        const saveRsp = await sysHttp.post("docker/config/save", {
            http_proxy,
            https_proxy,
            no_proxy,
            registry_mirrors: splitList(registry_mirrors),
            insecure_registries: splitList(insecure_registries),
            debug,
            data_root,
            storage_driver,
            log_driver,
            iptables,
            live_restore,
        });
        if (saveRsp?.code !== RCode.Success) {
            NotyFail(t("保存失败"));
            return;
        }
        // 二次确认是否重启 docker 使代理生效（可能有权限/影响线上的风险，需用户明确同意）
        set_show_confirm({
            open: true,
            title: t("是否重启 Docker 服务以生效？"),
            sub_title: t("重启 Docker 会短暂中断容器服务，请确认当前没有关键任务在执行"),
            handle: async () => {
                const restartRsp = await sysHttp.post("docker/restart");
                set_show_confirm({open: false, handle: null});
                if (restartRsp?.code === RCode.Success) {
                    NotySuccess(t("已重启 Docker，代理配置已生效"));
                } else {
                    NotyFail(t("重启失败"));
                }
            },
        });
    };

    return (
        <div>
            <Header>
                <ActionButton icon={"arrow_back"} title={t("返回")} onClick={() => navigate(-1)} />
            </Header>
            <FullScreenDiv isFull={true} more={true}>
                <FullScreenContext>
                    <Dashboard>
                        <Row>
                            <Column widthPer={60}>
                                <CardFull self_title={<span className={"div-row"}><h2>{t("Docker 代理配置")}</h2></span>} titleCom={
                                    <div className={"db-query-setting__toolbar"}>
                                        <ActionButton icon={"save"} title={t("保存")} onClick={() => save()} />
                                    </div>
                                }>
                                    <div className={"docker-setting__form"}>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("HTTP 代理")}</label>
                                            <InputText placeholder={"http://127.0.0.1:3067"} value={http_proxy}
                                                       handleInputChange={(v) => set_http_proxy(v)} />
                                        </div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("HTTPS 代理")}</label>
                                            <InputText placeholder={"https://127.0.0.1:3067"} value={https_proxy}
                                                       handleInputChange={(v) => set_https_proxy(v)} />
                                        </div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("No Proxy")}</label>
                                            <InputText placeholder={"localhost,127.0.0.1"} value={no_proxy}
                                                       handleInputChange={(v) => set_no_proxy(v)} />
                                        </div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("镜像加速")}</label>
                                            <InputText placeholder={"https://docker.mirrors.ustc.edu.cn,https://hub-mirror.c.163.com"} value={registry_mirrors}
                                                       handleInputChange={(v) => set_registry_mirrors(v)} />
                                        </div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("不安全仓库")}</label>
                                            <InputText placeholder={"127.0.0.1:5000,registry.example.com"} value={insecure_registries}
                                                       handleInputChange={(v) => set_insecure_registries(v)} />
                                        </div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("开启调试")}</label>
                                            <Select options={[{title: t("是"), value: true}, {title: t("否"), value: false}]}
                                                    value={debug}
                                                    onChange={(v) => set_debug(!!v)} />
                                        </div>
                                        <div className={"docker-setting__separator"}>{t("存储 / 日志 / 网络")}</div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("数据存储目录")}</label>
                                            <InputText placeholder={"/var/lib/docker"} value={data_root}
                                                       handleInputChange={(v) => set_data_root(v)} />
                                        </div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("存储驱动")}</label>
                                            <InputText placeholder={"overlay2"} value={storage_driver}
                                                       handleInputChange={(v) => set_storage_driver(v)} />
                                        </div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("日志驱动")}</label>
                                            <InputText placeholder={"json-file"} value={log_driver}
                                                       handleInputChange={(v) => set_log_driver(v)} />
                                        </div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("启用 iptables")}</label>
                                            <Select options={[{title: t("是"), value: true}, {title: t("否"), value: false}]}
                                                    value={iptables}
                                                    onChange={(v) => set_iptables(!!v)} />
                                        </div>
                                        <div className={"docker-setting__field"}>
                                            <label className={"docker-setting__label"}>{t("Live Restore")}</label>
                                            <Select options={[{title: t("是"), value: true}, {title: t("否"), value: false}]}
                                                    value={live_restore}
                                                    onChange={(v) => set_live_restore(!!v)} />
                                        </div>
                                        <p className={"docker-setting__tip"}>{t("代理写入 systemd 服务环境变量，其余写入 daemon.json；修改后需重启 Docker 生效，请谨慎操作（尤其数据存储目录变更）。")}</p>
                                    </div>
                                </CardFull>
                            </Column>
                        </Row>
                    </Dashboard>
                </FullScreenContext>
            </FullScreenDiv>
        </div>
    );
}
