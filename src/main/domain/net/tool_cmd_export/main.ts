/**
 * 内网穿透客户端命令行工具。
 *
 * 消息处理与正式运行时完全一致：import tcp.forward.controller 即由 @tcp_client_msg 完成注册，
 * 业务逻辑全部在 tcp_forward_client_service / tcpSyncClientService 中，本文件不重复实现。
 * 配置持久化使用项目自己的 DataUtil（与正式环境 onModuleInit 的做法一致）。
 *
 * 用法：
 *   filecat-tcp-client --server-ip 1.2.3.4 --server-port 5567 --key xxxx [--name 我的电脑] [--filecat]
 *   filecat-tcp-client --env ./client.env
 *   filecat-tcp-client --env ./client.env --key 覆盖用的key
 *
 * env 文件支持的行（# 或 ; 开头为注释）：
 *   SERVER_IP=1.2.3.4
 *   SERVER_PORT=5567
 *   KEY=服务端配置的密钥
 *   CLIENT_NAME=我的电脑
 */
import path from "path";
import fs from "fs";
import {Env} from "../../../../common/node/Env";
import {tcp_forward_client_service} from "../tcp.forward.client.service";
import {DataUtil} from "../../data/DataUtil";
import {file_key} from "../../data/data_type";
import {TcpForwardController} from "../tcp.forward.controller";


/** 命令行/env 解析后的客户端配置 */
interface client_options {
    server_ip: string
    server_port: number
    key: string
    client_name?: string
}

/** 解析 --key value 形式的参数，同名 key 以最后一次为准 */
function parse_args(argv: string[]): { [key: string]: string } {
    const result: { [key: string]: string } = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("--")) continue;
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
            result[key] = next;
            i++;
        } else {
            result[key] = "true";
        }
    }
    return result;
}

/** 读取 env 文件，返回 key -> value（key 统一小写，方便和命令行参数合并） */
function read_env_file(file: string): { [key: string]: string } {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) {
        throw new Error(`env 文件不存在: ${abs}`);
    }
    const data: { [key: string]: string } = {};
    Env.load(fs.readFileSync(abs, "utf8"), data);
    const lower: { [key: string]: string } = {};
    for (const key of Object.keys(data)) {
        lower[key.toLowerCase()] = data[key];
    }
    return lower;
}

/** 命令行参数名 -> 内部配置名 */
const ARG_KEY_MAP: { [key: string]: string } = {
    "server-ip": "server_ip",
    "server-port": "server_port",
    "key": "key",
    "name": "client_name",
};

/** 合并 env 文件 / 命令行 两层来源，优先级后者高 */
function build_options(args: { [key: string]: string }): client_options {
    const base: { [key: string]: string } = {};
    if (args.env) {
        Object.assign(base, read_env_file(args.env));
    }
    for (const arg_name of Object.keys(ARG_KEY_MAP)) {
        if (args[arg_name] !== undefined) {
            base[ARG_KEY_MAP[arg_name]] = args[arg_name];
        }
    }

    const server_ip = base.server_ip;
    const server_port = Number(base.server_port);
    const key = base.key;
    if (!server_ip) {
        throw new Error("缺少服务器地址，请通过 --server-ip 或 env 文件中的 SERVER_IP 指定");
    }
    if (!server_port || Number.isNaN(server_port)) {
        throw new Error("缺少或非法的服务器端口，请通过 --server-port 或 env 文件中的 SERVER_PORT 指定");
    }
    if (!key) {
        throw new Error("缺少密钥，请通过 --key 或 env 文件中的 KEY 指定");
    }

    return {
        server_ip,
        server_port,
        key,
        client_name: base.client_name,
    };
}

/** 输出使用说明 */
function print_help() {
    console.log(`内网穿透客户端

用法:
  filecat-tcp-client --server-ip <ip> --server-port <port> --key <key> [--name <名称>]
  filecat-tcp-client --env <配置文件>

可选参数:
  --env          env 配置文件路径，支持 SERVER_IP / SERVER_PORT / KEY / CLIENT_NAME
  --name         客户端名称
  --data         数据目录，存放 DataUtil 的持久化文件，默认为当前目录下的 data
  --help         显示帮助`);
}

export async function main(argv: string[] = process.argv.slice(2)) {
    const args = parse_args(argv);
    if (args.help) {
        print_help();
        return;
    }
    // DataUtil 依赖 Env.work_dir 存放持久化文件
    if (args.data) {
        Env.work_dir = path.resolve(args.data);
    }
    fs.mkdirSync(Env.work_dir, {recursive: true});

    const options = build_options(args);
    // import 即完成 @tcp_client_msg 注册，本工具不重复实现任何接口
    void TcpForwardController;
    // 初始化客户端配置的持久化文件
    DataUtil.init(file_key.tcp_proxy_server_client);

    // 与正式环境 onModuleInit 一致：已有同 ip/port 的配置就复用，没有再新增
    const old_fig = tcp_forward_client_service.client_fig_get();
    let have = false;
    for (const it of old_fig.list) {
        if (it.serverIp === options.server_ip && it.serverPort === options.server_port) {
            have = true;
            break;
        }
    }
    if (!have) {
        // 新增配置必须带 index，client_fig_save 才会写入列表
        tcp_forward_client_service.client_fig_save({
            serverPort: options.server_port,
            client_name: options.client_name,
            key: options.key,
            open: true,
            serverIp: options.server_ip,
            index: old_fig.list.length,
        });
    }
    console.log(`连接 ${options.server_ip}:${options.server_port} ...`);
    tcp_forward_client_service.client_init_to_server().catch(console.error);
}

// 作为命令行工具直接执行时自动启动
if (require.main === module) {
    main().catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
