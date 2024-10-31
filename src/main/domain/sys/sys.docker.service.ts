import {CmdType, WsData} from "../../../common/frame/WsData";
import {SysPojo} from "../../../common/req/sys.pojo";
import {Wss} from "../../../common/frame/ws.server";
import {exec, execSync, spawn} from "child_process";
import {SystemUtil} from "./sys.utl";
import {getShell} from "../shell/shell.service";
import WebSocket from "ws";

let sysJobInterval: any = null;

let dockerJobInterval: any = null;
let spawnChild: any = null;
let docker_result_list: any = [];
const dockerIndexMap = new Map();

const dockerMap = new Map<string, Wss>();

class SysDockerService {

    async pushDockerInfo(wss: Wss, results: any) {
        const result = new WsData<SysPojo>(CmdType.docker_getting);
        result.context = results;
        if (wss.ws.readyState ===WebSocket.CLOSED) {
            throw "断开连接";
        }
        wss.sendData(result.encode())
    }

    private async openDockerPush(wss: Wss) {
        try {
            this.getDockerInfo();
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
                const keys = dockerMap.keys();
                for (const socketId of keys) {
                    const wss = dockerMap.get(socketId)!;
                    try {
                        await this.pushDockerInfo(wss, docker_result_list);
                    } catch (e) {
                        console.log('docker信息推送失败docker',e)
                        dockerMap.delete(socketId);
                        if (wss) {
                            wss.ws.close();
                        }
                    }
                }
                // 优化点
                // this.getAllContainer();
            }, 1000);
        }
    }

    public get_all_images() {
        const images = [];
        let cons: any = execSync('docker images --format "{{.ID}};;{{.Repository}}:{{.Tag}};;{{.CreatedAt}};;{{.Size}}"');
        cons = cons.toString().split(/\n|\r\n/).filter(v => v.length > 0);
        for (let i = 1; i < cons.length; i++) {
            const con = cons[i];
            const parts = con.split(";;").filter(v => v.length > 0);
            images.push([
                parts[0],//id
                parts[1],//name
                parts[2], // 创建时间
                parts[3], // 大小
            ])
        }
        return images;
    }

    private getAllContainer() {
        const p_c = docker_result_list;
        docker_result_list = [];
        let cons: any = execSync('docker ps -a --no-trunc --format "table {{.ID}};;{{.Names}};;{{.Image}};;{{.Command}};;{{.Status}}"');
        cons = cons.toString().split(/\n|\r\n/).filter(v => v.length > 0);
        for (let i = 1; i < cons.length; i++) {
            const con = cons[i];
            const parts = con.split(";;").filter(v => v.length > 0);
            const dockerIdIndex = dockerIndexMap.get(parts[0]);
            const c = dockerIdIndex!==undefined&&dockerIdIndex!==null?p_c[dockerIdIndex]:undefined;
            docker_result_list.push([
                parts[0].slice(0, 10),//id
                parts[1],//name
                parts[2],
                parts[3],
                parts[4],
                c!==undefined?c[5]:0,
                c!==undefined?c[6]:0,
            ])
            dockerIndexMap.set(parts[0], i - 1);
        }
    }
    private killDockerSpwn() {
        if (spawnChild) {
            SystemUtil.killProcess(spawnChild.pid);
            spawnChild=null;
        }
    }
    private getDockerInfo() {
        try {
            if (spawnChild) {
                return;
            }
            this.getAllContainer();
            let child = spawn('docker stats  --no-trunc --format "table {{.ID}};;{{.MemUsage}};;{{.CPUPerc}}"', [...docker_result_list.map(v => v[0])], {shell: getShell()});
            spawnChild = child;
            // 监听子进程的 stdout 流，并输出数据
            child.stdout.on('data', (data) => {
                if (!data && !data.toString()) {
                    return;
                }
                let containers = data.toString().split(/\n|\r\n/).filter(v => v.length > 1);
                for (let i = 1; i < containers.length; i++) {
                    const container = containers[i];
                    const parts = container.split(";;").filter(v => v.length > 0);
                    if (parts.length < 3) {
                        break;
                    }
                    const index = dockerIndexMap.get(parts[0]);
                    if (typeof index === "number") {
                        const mib = parts[1].split("/")[0];
                        docker_result_list[index][5] =mib ;
                        docker_result_list[index][6] = parts[2];
                    }
                }
                if (dockerMap.size === 0) {
                    this.dockerClear();
                }
            });
            // 监听子进程的 stderr 流，并输出错误
            child.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
                child.kill();
                this.dockerClear();
            });
            child.on('error', (err) => {
                console.error('Error:', err);
                this.dockerClear();
            });
            // child.on('close', (code) => {
            //     console.log(`dockrr child process exited with code ${code}`);
            // });
        } catch (e) {
            console.log(e)
            this.dockerClear();
        }
    }

    private dockerClear() {
        if (dockerJobInterval) {
            clearInterval(dockerJobInterval)
            dockerJobInterval = null;
        }
        this.killDockerSpwn();
        dockerMap.clear();
    }

    async dockerGet(data: WsData<any>) {
        const id = (data.wss as Wss).id;
        if (dockerMap.get(id)) {
            return;
        }
        if (!SystemUtil.commandIsExist(" docker ps")) {
            (data.wss as Wss).ws.close();
            return;
        }
        dockerMap.set((data.wss as Wss).id, (data.wss as Wss))
        await this.openDockerPush((data.wss as Wss));
    }


    async dockerSwitch(data:WsData<any>) {
        if (data.context.type === "start") {
            await exec(`docker start ${data.context.dockerId}`);
        } else if (data.context.type === "stop") {
            await exec(`docker stop ${data.context.dockerId}`);
        }
        this.getAllContainer();
    }

    async dockerDelContainer(data:WsData<any>) {
        await exec(`docker stop ${data.context.dockerId}`);
        await exec(`docker rm ${data.context.dockerId}`);
    }

    async check_image_delete(ids:string[]) {
        const not_delete_ids:string[]  = [];
        for (const id of ids) {
            const stdout = execSync(`docker ps -a --filter ancestor=${id} --format "{{.ID}}"`).toString();
            if (stdout.trim()) {
                // 有容器使用
                not_delete_ids.push(id);
            }
        }
        return not_delete_ids;
    }

    async delete_image(ids:string[]) {
        const param = ids.join(" ");
        execSync(`docker rm  ${param}`)
    }

}

export const SysDockerServiceImpl = new SysDockerService();
