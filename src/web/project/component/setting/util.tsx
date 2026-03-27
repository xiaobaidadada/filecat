import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {SysSoftware} from "../../../../common/req/setting.req";
import React from "react";


export function using_env_prompt() {
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);

    const soft_ware_info_click = (id)=>{
        let context;
        if(id === SysSoftware.ffmpeg) {
            context = <div>
                视频转换，rtsp播放器等媒体功能都需要这个软件。linux下你可以使用apt或者yum来安装，或者直接输入软件的位置
            </div>
        } else if (id === SysSoftware.smartmontools) {
            context = <div>
                磁盘检查需要这个软件。linux下你可以使用apt或者yum来安装，或者直接输入软件的位置。
            </div>
        } else if (id === SysSoftware.ntfs_3g) {
            context = <div>
                如果在linux需要挂载ntfs的硬盘，需要这个软件支持。
            </div>
        } else if(id === "保护目录") {
            context = <div>
                在删除的时候保护目录会拒绝删除。
                <ul>
                    <li>可以使用 /* 来表达该目录下所有文件都禁止删除</li>
                    <li>可以使用 /** 来表达该目录下所有子目录文件都禁止删除</li>
                </ul>
            </div>
        } else if (id === "文件夹路径") {
            context = <div>
                用于在文件夹下切换根目录
            </div>
        } else if(id === "环境路径") {
            context = <div>
                当在不同用户环境下运行的时候由于没有执行终端去加载PATH，这里可以添加额外的PATH路径，点击这里的保存还会更新系统上的path路径
            </div>
        } else if(id === "pty") {
            context = <div>
                一些需要Pty环境的命令
            </div>
        } else if (id === "文件上传" ) {
            context = <div>
                <li>
                    对于不同的目录(包括所有子目录)，可能是机械或者固态硬盘，机械硬盘在处理多个小文件的时候会做随机i/o,由于一般只有一个盘头所以会影响整体效率，特别是写操作，这里提供了上传时候的最大数量限制，对于下载数量目前不做限制.
                </li>
                <li>
                    大文件支持断点和分块并发传输，建议并发数量设置为2，分块大小设置为10MB，大文件判断为500MB，设置过大的话会上传的时候会占据较大内存
                </li>
            </div>
        } else if(id === "目录快捷命令") {
            context = <div>
                右键文件夹空白处用于，打开终端快捷执行命令
            </div>
        } else if(id === "文件快捷命令") {
            context = <div>
                用于右键特定后缀的文件，执行一些快捷命令，文件后缀可以是多个，用空格分割
            </div>
        } else if(id === "Workflow") {
            context = <div>
                <li>
                    在特定的时间启动系统中的workflow任务
                </li>
                <li>
                    cron表达式是定时器 格式为： 秒 分 时 日 月 星期
                </li>
                <li>
                    <li>
                        1. "*"（通配符,所有值）
                    </li>
                    <li>
                        2. "," 是枚举: 0 0 1,15 * * *
                    </li>
                    <li>
                        3. "-" 是范围: 0 0 1-5 * * *
                    </li>
                    <li>
                        4. "/" 是步长，标识每隔n执行 */3 * * * * * 每隔三秒，必须配合 * 使用 ,/ 只能写一次 ，有了/就成了定时器，而不是指定时间执行
                    </li>
                </li>
            </div>
        }
        set_prompt_card({open:true,title:"信息",context_div : (
                <div >
                    {context}
                </div>
            )})
    }
    return soft_ware_info_click
}