import { useAtom } from 'jotai'; 
import {$stroe} from "../../util/store";
import {SysSoftware} from "../../../../common/req/setting.req";
import React, {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {themes_list} from "../../../../common/req/user.req";
import {settingHttp} from "../../util/config";


export function using_env_prompt() {
    const [prompt_card, set_prompt_card] = useAtom($stroe.prompt_card);
    const { t, i18n } = useTranslation();

    return (id) => {
        let context;
        if (id === SysSoftware.ffmpeg) {
            context = <div>
                视频转换，rtsp播放器等媒体功能都需要这个软件。linux下你可以使用apt或者yum来安装，或者直接输入软件的位置
            </div>
        } else if (id === SysSoftware.smartmontools) {
            context = <div>
                磁盘检查需要这个软件。linux下你可以使用apt或者yum来安装，或者直接输入软件的位置。
            </div>
        }
        // else if (id === SysSoftware.ntfs_3g) {
        //     context = <div>
        //         如果在linux需要挂载ntfs的硬盘，需要这个软件支持。
        //     </div>
        // }
        else if (id === "保护目录") {
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
        } else if (id === "环境路径") {
            context = <div>
                当在不同用户环境下运行的时候由于没有执行终端去加载PATH，这里可以添加额外的PATH路径，点击这里的保存还会更新系统上的path路径
            </div>
        } else if (id === "pty") {
            context = <div>
                一些需要Pty环境的命令
            </div>
        } else if (id === "文件上传") {
            context = <div>
                <ul>
                    <li>
                        对于不同的目录(包括所有子目录)，可能是机械或者固态硬盘，机械硬盘在处理多个小文件的时候会做随机i/o,由于一般只有一个盘头所以会影响整体效率，特别是写操作，这里提供了上传时候的最大数量限制，对于下载数量目前不做限制.
                    </li>
                    <li>
                        大文件支持断点和分块并发传输，建议并发数量设置为2，分块大小设置为10MB，大文件判断为500MB，设置过大的话会上传的时候会占据较大内存
                    </li>
                </ul>
            </div>
        } else if (id === "目录快捷命令") {
            context = <div>
                右键文件夹空白处用于，打开终端快捷执行命令
            </div>
        } else if (id === "文件快捷命令") {
            context = <div>
                用于右键特定后缀的文件，执行一些快捷命令，文件后缀可以是多个，用空格分割
            </div>
        } else if (id === "Workflow") {
            context = <div>
                <ul>
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
                            4. "/" 是步长，标识每隔n执行 */3 * * * * * 每隔三秒，必须配合 * 使用 ,/ 只能写一次
                            ，有了/就成了定时器，而不是指定时间执行
                        </li>
                    </li>
                </ul>
            </div>
        } else if (id === '插件配置') {
            context = <div>
                {t("路径可以是一个 js 文件也可以是一个node 项目目录")}
            </div>
        } else if (id ==='机器人配置') {
            context = <div>
                <dv>
                    机器人功能用于开通各种第三方支持的机器人，让第三方机器人接入本地的 AI 模型。
                </dv>
                <ul>
                   <li> 1. qq 机器人需要先在手机 app 中添加，然后在https://q.qq.com/qqbot/ 登录机器人配置页面，在开发管理中复制机器人的 appId,appSecret 到这里就完成了配置了。
                   </li>
                    <li> 2. https://opensource.dingtalk.com/developerpedia/docs/explore/tutorials/stream/bot/nodejs/create-bot 这个是钉钉机器人开通教程，注意复制钉钉的 clientId 的是时候不要复制成appId 了。
                    </li>
                    <li> 3. 企业微信机器人的开通甚至不需要 pc 操作，在通讯录中点击智能机器人，选择 api 模式，就创建完成了，手机上直接复制 id 和密钥。
                    </li>
                    <li> 4. 飞书https://open.feishu.cn/document/develop-an-echo-bot/introduction?from=banner 登录这个开发者后台，按照这个地址教程创建机器人，使用的时候这个机器人是作为一个应用，可以在工作台内搜索你的这个机器人的名字。
                    </li>
                </ul>
            </div>
        }
        set_prompt_card({
            open: true, title: "信息", context_div: (
                <div>
                    {context}
                </div>
            )
        })
    }
}

let dynamic_themes_list:{ value: string; title: string; id?: string }[] = themes_list

export function use_themes_list() {
    const [d_themes_list,set_themes_list] = useState([]);
    const fetch_themes = async () => {
        try {
            const result = await settingHttp.get("themes");
            if (result.code === 0) { // RCode.Success = 0
                const list =   result.data || [];
                dynamic_themes_list = [...themes_list,...list];
                // console.log(dynamic_themes_list)
                set_themes_list(dynamic_themes_list);
            } else {
                console.warn("获取主题列表失败，使用默认列表");
                set_themes_list(dynamic_themes_list);
            }
        } catch (error) {
            set_themes_list(dynamic_themes_list);
        }
    }
    useEffect(() => {
        fetch_themes()
    },[])

    return d_themes_list;
}