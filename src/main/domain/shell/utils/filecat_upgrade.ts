import path from "path";
import {ChildProcessUtil, filecat_cmd} from "../../../../common/node/childProcessUtil";
import {DataUtil} from "../../data/DataUtil";
import {data_dir_tem_name} from "../../data/data_type";
import {settingService} from "../../setting/setting.service";
import {getSys} from "../shell.service";
import {SysEnum} from "../../../../common/req/user.req";
import {SystemUtil} from "../../sys/sys.utl";
import {ShellUtil} from "./shell.util";
import {PtyShell} from "pty-shell";

export class filecat_upgrade_class {

    exit:() => void;
    print:(str:string)=>void;

    kill() {

    }

    init():void {
        this.print("\r\n")
        this.handle(this.params).catch((e)=>{
            this.print(e?.message??e);
            this.exit()
        })
    }

    params
    constructor(pty:PtyShell,exit:()=>void,print:(str: string) => void,params:string[]) {
        this.exit = ()=>{
            print("\r\n");
            exit()
        };
        this.print = print;
        this.params = params
    }



    async handle(params:string[]) {
        // process.env.run_env = "exe"
        if(process.env.run_env === "exe") {
            let download_url = params[0]
            if(!download_url) {
                const sys = getSys()
                if(sys === SysEnum.win) {
                    if(!SystemUtil.is_x86()) {
                        this.print(" windows下暂时只执行x86芯片! ")
                        this.exit()
                        return;
                    }
                    download_url = 'https://github.com/xiaobaidadada/filecat/releases/latest/download/filecat-win-x64.tar.gz'
                } else if(sys === SysEnum.linux) {
                    if(!SystemUtil.is_x86()) {
                        this.print(" linux下暂时只执行x86芯片! ")
                        this.exit()
                        return;
                    }
                    download_url = 'https://github.com/xiaobaidadada/filecat/releases/latest/download/filecat-linux-x64.tar.gz'
                } else if(sys === SysEnum.mac) {
                    if(!SystemUtil.is_arm()) {
                        this.print(" mac下暂时只执行M芯片! ")
                        this.exit()
                        return;
                    }
                    download_url = 'https://github.com/xiaobaidadada/filecat/releases/latest/download/filecat-mac-arm.tar.gz'
                } else {
                    this.print(" 该系统暂时无法自动升级! ")
                    this.exit()
                    return;
                }
            }
            if(!path.isAbsolute(download_url)) {
                this.print("开始下载文件\r\n")
                download_url = await ChildProcessUtil.down_load_file(download_url,DataUtil.get_tem_path(data_dir_tem_name.filecat_upgrade_dir),(num)=>{
                    // this.print(`\r\x1b[K下载进度: ${num}%`);
                    this.print(ShellUtil.render_progress(num))
                })
            }
            this.print("\n\r下载完成，开始解压...")
            ChildProcessUtil.send_father(filecat_cmd.filecat_upgrade,{
                file_path:download_url,
                run_env:process.env.run_env
            })
        } else if (process.env.run_env === "npm") {
            this.print("开始全局安装 filecat ")
            await ChildProcessUtil.send_father(filecat_cmd.filecat_upgrade,{
                run_env:process.env.run_env,
                paths:settingService.get_env_path(),
                registry:params?.[0]
            })
        } else {
            throw '未知的安装方式 或者本地dev启动 找不到升级方式'
        }
    }

    write(str:string):void {

    }

}