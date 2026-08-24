import {CmdType, WsData} from "../../../common/frame/WsData";
import {SysPojo} from "../../../common/req/sys.pojo";
import {Wss} from "../../../common/frame/ws.server";
import {exec, spawn} from "child_process";
import {SystemUtil} from "./sys.utl";
import {getShell, getSys} from "../shell/shell.service";
import WebSocket from "ws";
import path from "path";
import {SysEnum} from "../../../common/req/user.req";
import {get_bin_dependency} from "../bin/get_bin_dependency";
import {FileUtil} from "../file/FileUtil";

let sysJobInterval: any = null;
let dockerJobInterval: any = null;
let spawnChild: any = null;
let docker_result_list: any = [];
const dockerIndexMap = new Map();
const dockerMap = new Map<string, Wss>();

export let docker: any;

class SysDockerService {
    public isUnixLike() {
        const type = getSys()
        const r = type === SysEnum.linux || type === SysEnum.mac;
        if (r === true && docker == null) {
            const Docker = get_bin_dependency("@xiaobaidadada/dockerode")
            docker = new Docker({socketPath: "/var/run/docker.sock"})
        }
        return r;
    }

    async pushDockerInfo(wss: Wss, results: any) {
        const result = new WsData<SysPojo>(CmdType.docker_getting);
        result.context = results;
        if (wss.ws.readyState === WebSocket.CLOSED) {
            throw "断开连接";
        }
        wss.sendData(result.encode());
    }

    private async openDockerPush(wss: Wss) {
        try {
            await this.getDockerInfo();
            await this.pushDockerInfo(wss, docker_result_list);
        } catch (e) {
            dockerMap.delete(wss.id);
            return;
        }
        if (!dockerJobInterval) {
            dockerJobInterval = setInterval(async () => {
                if (dockerMap.size === 0) {
                    clearInterval(dockerJobInterval);
                    dockerJobInterval = null;
                    this.killDockerSpwn();
                    return;
                }
                for (const socketId of dockerMap.keys()) {
                    const wss = dockerMap.get(socketId)!;
                    try {
                        await this.pushDockerInfo(wss, docker_result_list);
                    } catch (e) {
                        console.log("docker信息推送失败", e);
                        dockerMap.delete(socketId);
                        if (wss) wss.ws.close();
                    }
                }
            }, 1000);
        }
    }

    // ✅ 使用 dockerode 获取镜像列表（Linux / Mac）
    async get_all_images() {
        if (this.isUnixLike()) {
            const images = await docker.listImages();
            const list: any[][] = [];

            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                list.push([
                    img.Id.replace(/^sha256:/, '').substring(0, 12), // 去掉 sha256 前缀，取短ID
                    (img.RepoTags && img.RepoTags[0]) || "<none>",
                    new Date(img.Created * 1000).toISOString(),
                    `${(img.Size / 1024 / 1024).toFixed(1)}MB`,
                ]);
            }

            return list;
        } else {
            // fallback
            const images = [];
            let cons: any = await SystemUtil.execAsync('docker images --format "{{.ID}};;{{.Repository}}:{{.Tag}};;{{.CreatedAt}};;{{.Size}}"');
            cons = cons.toString().split(/\n|\r\n/).filter(v => v.length > 0);
            for (let i = 0; i < cons.length; i++) {
                const con = cons[i];
                const parts = con.split(";;").filter(v => v.length > 0);
                images.push([parts[0], parts[1], parts[2], parts[3]]);
            }
            return images;
        }
    }

    // ✅ 获取容器信息（自动切换 dockerode）
    private async getAllContainer() {
        if (this.isUnixLike()) {
            const prevList = docker_result_list;
            docker_result_list = [];

            const containers = await docker.listContainers({all: true});
            containers.forEach((c, i) => {
                const index = dockerIndexMap.get(c.Id);
                const prev = typeof index === "number" ? prevList[index] : undefined;
                docker_result_list.push([
                    c.Id.substring(0, 10),
                    c.Names[0].replace(/^\//, ""),
                    c.Image,
                    c.Command,
                    c.Status,
                    prev ? prev[5] : 0, // MemUsage
                    prev ? prev[6] : 0, // CPU%
                ]);
                dockerIndexMap.set(c.Id, i);
            });
        } else {
            const p_c = docker_result_list;
            docker_result_list = [];
            let cons: any = await SystemUtil.execAsync('docker ps -a --no-trunc --format "table {{.ID}};;{{.Names}};;{{.Image}};;{{.Command}};;{{.Status}}"');
            cons = cons.toString().split(/\n|\r\n/).filter(v => v.length > 0);
            for (let i = 1; i < cons.length; i++) {
                const con = cons[i];
                const parts = con.split(";;").filter(v => v.length > 0);
                const dockerIdIndex = dockerIndexMap.get(parts[0]);
                const c = dockerIdIndex !== undefined && dockerIdIndex !== null ? p_c[dockerIdIndex] : undefined;
                docker_result_list.push([
                    parts[0].slice(0, 10),
                    parts[1],
                    parts[2],
                    parts[3],
                    parts[4],
                    c !== undefined ? c[5] : 0,
                    c !== undefined ? c[6] : 0,
                ]);
                dockerIndexMap.set(parts[0], i - 1);
            }
        }
    }

    private killDockerSpwn() {
        if (spawnChild) {
            SystemUtil.killProcess(spawnChild.pid);
            spawnChild = null;
        }
    }

    private async getDockerInfo() {
        try {
            if (this.isUnixLike()) {
                // Linux / macOS: dockerode + API 获取 stats
                await this.getAllContainer();
                const containers = await docker.listContainers({all: true});
                for (const c of containers) {
                    const container = docker.getContainer(c.Id);
                    container.stats({stream: false}, (err, stats) => {
                        if (err || !stats) return;
                        const index = dockerIndexMap.get(c.Id);
                        if (typeof index === "number") {
                            const mem = (stats.memory_stats.usage / 1024 / 1024).toFixed(1) + "MiB";
                            const cpu = this.calcCPUPercent(stats);
                            docker_result_list[index][5] = mem;
                            docker_result_list[index][6] = cpu + "%";
                        }
                    });
                }
            } else {
                // Windows fallback：spawn docker stats
                if (spawnChild) return;
                this.getAllContainer();
                let child = spawn('docker stats --all --no-trunc --format "table {{.ID}};;{{.MemUsage}};;{{.CPUPerc}}"', [], {shell: getShell()});
                spawnChild = child;
                child.stdout.on("data", (data) => {
                    if (!data || !data.toString()) return;
                    let containers = data.toString().split(/\n|\r\n/).filter(v => v.length > 1);
                    for (let i = 1; i < containers.length; i++) {
                        const container = containers[i];
                        const parts = container.split(";;").filter(v => v.length > 0);
                        if (parts.length < 3) break;
                        const index = dockerIndexMap.get(parts[0]);
                        if (typeof index === "number") {
                            const mib = parts[1].split("/")[0];
                            docker_result_list[index][5] = mib;
                            docker_result_list[index][6] = parts[2];
                        }
                    }
                });
                child.stderr.on("data", (data) => {
                    console.error(`stderr: ${data}`);
                    child.kill();
                    this.dockerClear();
                });
                child.on("error", (err) => {
                    console.error("Error:", err);
                    this.dockerClear();
                });
            }
        } catch (e) {
            console.log(e);
            this.dockerClear();
        }
    }

    private calcCPUPercent(stats: any): string {
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const result = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100.0;
        return result ? result.toFixed(2) : "0.00";
    }

    private dockerClear() {
        if (dockerJobInterval) {
            clearInterval(dockerJobInterval);
            dockerJobInterval = null;
        }
        this.killDockerSpwn();
        dockerMap.clear();
    }

    async dockerGet(data: WsData<any>) {
        const id = (data.wss as Wss).id;

        // 如果已经存在连接，直接刷新容器信息
        if (dockerMap.get(id)) {
            await this.getAllContainer();
            return;
        }

        // 判断系统和 docker 命令可用性
        if (!this.isUnixLike() && !SystemUtil.commandIsExist("docker ps")) {
            (data.wss as Wss).ws.close();
            return;
        }

        // 保存 websocket 连接
        dockerMap.set(id, data.wss as Wss);

        // 打开定时推送
        await this.openDockerPush(data.wss as Wss);
    }


    async dockerSwitch(data: WsData<any>) {
        const id = data.context.dockerId;

        if (this.isUnixLike()) {
            // 使用 dockerode
            try {
                const container = docker.getContainer(id);
                if (data.context.type === "start") {
                    await container.start().catch(() => {
                    });
                } else if (data.context.type === "stop") {
                    await container.stop().catch(() => {
                    });
                }
            } catch (err: any) {
                console.error(`容器 ${id} ${data.context.type} 失败:`, err.message || err);
            }
        } else {
            // fallback exec
            try {
                if (data.context.type === "start") {
                    await exec(`docker start ${id}`);
                } else if (data.context.type === "stop") {
                    await exec(`docker stop ${id}`);
                }
            } catch (err) {
                console.error(`容器 ${id} ${data.context.type} 执行失败`);
            }
        }

        // 更新容器列表
        await this.getAllContainer();
    }


    async dockerDelContainer(data: WsData<any>) {
        const id = data.context.dockerId;

        if (this.isUnixLike()) {
            // 使用 dockerode
            try {
                const container = docker.getContainer(id);
                await container.stop().catch(() => {
                }); // 捕获停止异常
                await container.remove().catch(() => {
                }); // 捕获删除异常
            } catch (err: any) {
                console.error(`删除容器 ${id} 失败:`, err.message || err);
            }
        } else {
            // fallback exec
            try {
                await exec(`docker stop ${id}`);
            } catch (err) {
            }
            try {
                await exec(`docker rm ${id}`);
            } catch (err) {
            }
        }

        // 更新容器列表
        await this.getAllContainer();
    }


    async check_image_delete(ids: string[]) {
        for (const it of ids) {
            if (it.includes(" ")) throw "error params";
        }

        const not_delete_ids: string[] = [];

        if (this.isUnixLike()) {
            // Linux / macOS 使用 dockerode
            const containers = await docker.listContainers({all: true});
            for (const id of ids) {
                const inUse = containers.some(c => c.Image === id || (c.ImageID && c.ImageID.startsWith(id)));
                if (inUse) not_delete_ids.push(id);
            }
        } else {
            // fallback: execSync
            for (const id of ids) {
                const stdout = (await SystemUtil.execAsync(`docker ps -a --filter ancestor=${id} --format "{{.ID}}"`)).toString();
                if (stdout.trim()) not_delete_ids.push(id);
            }
        }

        return not_delete_ids;
    }


    async delete_image(ids: string[]) {
        for (const it of ids) {
            if (it.includes(" ")) throw "error params";
        }

        if (this.isUnixLike()) {
            // 使用 dockerode 删除镜像
            for (const id of ids) {
                const image = docker.getImage(id);
                try {
                    await image.remove({force: true}); // force 避免容器依赖报错
                } catch (err: any) {
                    console.error(`删除镜像 ${id} 失败:`, err.message || err);
                }
            }
        } else {
            // fallback: execSync
            const param = ids.join(" ");
            await SystemUtil.execAsync(`docker rmi ${param}`);
        }
    }


    // ==================== Docker daemon 代理配置（daemon.json 的 proxies 字段） ====================

    /** daemon.json 路径（Linux 默认）；macOS 无该文件则当作空配置处理 */
    private get daemonPath(): string {
        return "/etc/docker/daemon.json";
    }

    /** Docker daemon 配置与 systemctl 重启仅适用于 Linux，其余平台返回 false */
    private isLinux(): boolean {
        return getSys() === SysEnum.linux;
    }

    /** 读取 daemon.json 原始对象（文件不存在或非法时返回空对象） */
    private async readDaemonConf(): Promise<any> {
        try {
            const raw = await FileUtil.readFileSync(this.daemonPath);
            if (!raw) return {};
            const parsed = JSON.parse(raw.toString());
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    /**
     * 读取 Docker 配置（daemon.json 常用字段）
     * 返回代理 + 镜像加速 + 不安全仓库 + 数据/日志/网络安全等字段
     */
    async get_docker_config() {
        // 仅 Linux 才有 /etc/docker/daemon.json 与 systemctl 管理能力
        if (!this.isLinux()) return null;
        const conf = await this.readDaemonConf();
        const proxies = conf.proxies || {};
        return {
            http_proxy: proxies["http-proxy"] || "",
            https_proxy: proxies["https-proxy"] || "",
            no_proxy: proxies["no-proxy"] || "",
            // 兼容字符串或数组两种写法
            registry_mirrors: Array.isArray(conf["registry-mirrors"]) ? conf["registry-mirrors"] : (conf["registry-mirrors"] ? [conf["registry-mirrors"]] : []),
            insecure_registries: Array.isArray(conf["insecure-registries"]) ? conf["insecure-registries"] : (conf["insecure-registries"] ? [conf["insecure-registries"]] : []),
            debug: !!conf.debug,
            // 存储 / 日志 / 网络等关键字段
            data_root: conf["data-root"] || "",
            storage_driver: conf["storage-driver"] || "",
            log_driver: conf["log-driver"] || "",
            iptables: !!conf.iptables,
            live_restore: !!conf["live-restore"],
        };
    }

    /**
     * 保存 Docker 配置到 daemon.json（合并保留原有其他字段）
     * 空字符串/空数组表示清除对应项；布尔字段传入 undefined 表示保留原值
     */
    async save_docker_config(data: {
        http_proxy?: string; https_proxy?: string; no_proxy?: string;
        registry_mirrors?: string[]; insecure_registries?: string[]; debug?: boolean;
        data_root?: string; storage_driver?: string; log_driver?: string;
        iptables?: boolean; live_restore?: boolean;
    }) {
        // 仅 Linux 下才存在可写的 /etc/docker/daemon.json
        if (!this.isLinux()) throw new Error("Docker daemon 配置仅在 Linux 下支持");
        const conf = await this.readDaemonConf();

        // 代理（proxies 字段）：空字符串不写入（等价清除该项）
        if (data.http_proxy !== undefined || data.https_proxy !== undefined || data.no_proxy !== undefined) {
            const proxies: any = {};
            if (data.http_proxy) proxies["http-proxy"] = data.http_proxy;
            if (data.https_proxy) proxies["https-proxy"] = data.https_proxy;
            if (data.no_proxy) proxies["no-proxy"] = data.no_proxy;
            conf.proxies = proxies;
        }

        // 镜像加速 / 不安全仓库：数组形式（空数组清除）
        if (data.registry_mirrors !== undefined) {
            if (data.registry_mirrors.length > 0) conf["registry-mirrors"] = data.registry_mirrors;
            else delete conf["registry-mirrors"];
        }
        if (data.insecure_registries !== undefined) {
            if (data.insecure_registries.length > 0) conf["insecure-registries"] = data.insecure_registries;
            else delete conf["insecure-registries"];
        }

        // 调试开关
        if (data.debug !== undefined) conf.debug = data.debug;

        // 字符串字段：非空写入，空串清除
        const setStr = (key: string, v?: string) => {
            if (v === undefined) return;
            if (v) conf[key] = v;
            else delete conf[key];
        };
        setStr("data-root", data.data_root);
        setStr("storage-driver", data.storage_driver);
        setStr("log-driver", data.log_driver);

        // 布尔开关
        if (data.iptables !== undefined) conf.iptables = data.iptables;
        if (data.live_restore !== undefined) conf["live-restore"] = data.live_restore;

        // 确保 /etc/docker 目录存在
        await FileUtil.mkdirSync(path.dirname(this.daemonPath), {recursive: true});
        await FileUtil.writeFileSync(this.daemonPath, JSON.stringify(conf, null, 4) + "\n");
    }

    /** 重启 docker 服务（Linux，systemd）；需要用户在界面上二次确认后调用 */
    async restart_docker() {
        if (!this.isLinux()) throw new Error("重启 docker 仅在 Linux 下支持");
        await SystemUtil.execAsync("systemctl restart docker");
    }


}

export const SysDockerServiceImpl = new SysDockerService();
