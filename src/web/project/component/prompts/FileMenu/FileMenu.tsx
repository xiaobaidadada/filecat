import React, {useContext, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {VideoTrans} from "./VideoTrans";
import {UnCompress} from "./UnCompress";
import {SysSoftware} from "../../../../../common/req/setting.req";
import {NotyFail, NotySucess} from "../../../util/noty";
import {useTranslation} from "react-i18next";
import {FileMenuItem, OverlayTransparent, TextLine} from "../../../../meta/component/Dashboard";
import {FileCompressType, FileTypeEnum} from "../../../../../common/file.pojo";
import {use_auth_check, use_file_to_running, user_click_file} from "../../../util/store.util";
import {DiskMountAction} from "./DiskMountAction";
import {common_menu_type, run_workflow} from "./handle.service";
import {fileHttp, settingHttp, userHttp} from "../../../util/config";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {InputText, Select} from "../../../../meta/component/Input";
import {file_share_item, workflow_pre_input} from "../../../../../common/req/file.req";
import {Http_controller_router} from "../../../../../common/req/http_controller_router";
import {GlobalContext} from "../../../GlobalProvider";
import {useNavigate} from "react-router-dom";
import {ws} from "../../../util/ws";
import {CmdType} from "../../../../../common/frame/WsData";
import {PromptEnum} from "../Prompt";
import {copyToClipboard} from "../../../util/FunUtil";
import {path_join} from "pty-shell/dist/path_util";
import {SysEnum, UserAuth, UserBaseInfo} from "../../../../../common/req/user.req";
import {CardPrompt} from "../../../../meta/component/Card";
import {RCode} from "../../../../../common/Result.pojo";
import {routerConfig} from "../../../../../common/RouterConfig";


export function FileMenu() {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [shellShow, setShellShow] = useRecoilState($stroe.fileShellShow);
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const {t} = useTranslation();
    const navigate = useNavigate();
    const {check_user_auth} = use_auth_check();

    const must_needs = [
        {
            // 所有文件和目录都有的选项
            r: t("复制名字"), v: common_menu_type.file_copy_name, items:
                [
                    {r: "复制绝对路径", v: common_menu_type.file_copy_ab_path},
                    {r: "复制当前路径", v: common_menu_type.file_copy_now_path}
                ]

        }
    ]
    if(check_user_auth(UserAuth.share_file)) {
        // @ts-ignore
        must_needs.push({
            // 所有文件和目录都有的选项
            r: t("分享"), v: common_menu_type.share_file
        })
    }
    const show_items:any[] = [
        {r: t("以文本打开"), v: common_menu_type.open_text},
        {
            r: t("以日志打开"), v: common_menu_type.logviwer_text, items:
                [
                    {r: "utf8", v: common_menu_type.logviwer_utf8},
                    {r: "utf16", v: common_menu_type.logviwer_utf16},
                    {r: "utf32", v: common_menu_type.logviwer_utf32},
                    {r: "gbk", v: common_menu_type.logviwer_gbk},
                    {r: "gb2312", v: common_menu_type.logviwer_gb2312},
                    {r: "gb18030", v: common_menu_type.logviwer_gb18030},
                    // {r:"usc2",v: common_menu_type.logviwer_usc2},
                    {r: "windows1252", v: common_menu_type.logviwer_windows1252},
                    // {r:"big5",v: common_menu_type.logviwer_big5},
                    // {r:"ios-8859-1",v: common_menu_type.logviwer_ios_8859_1},
                ]
        },
        ...must_needs
    ]
    if (user_base_info.user_data?.file_quick_cmd) {
        for (const it of user_base_info.user_data.file_quick_cmd) {
            for (const key of (it.file_suffix ?? "").split(" ")) {
                if (showPrompt.data.filename?.endsWith(key)) {
                    show_items.push({
                        r: `${it.note}`,
                        v: common_menu_type.file_quick_cmd,
                        extra_value: it
                    })
                    break
                }
            }
        }
    }
    const [items, setItems,] = useState(show_items);
    // const [editorSetting, setEditorSetting] = useRecoilState($stroe.editorSetting)
    const [studio, set_studio] = useRecoilState($stroe.studio);
    const {click_file} = user_click_file();
    const [image_editor, set_image_editor] = useRecoilState($stroe.image_editor);
    const [shell_file_log, set_file_log] = useRecoilState($stroe.log_viewer);
    const [workflow_show, set_workflow_show] = useRecoilState($stroe.workflow_realtime_show);
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const {initUserInfo} = useContext(GlobalContext);
    const [folder_info_list_data, set_folder_info_list_data] = useRecoilState($stroe.folder_info_list_data);


    const items_folder = [{r: t("以studio打开"), v: common_menu_type.sutdio}, {
        r: t("统计信息"),
        v: common_menu_type.folder_size_info
    },...must_needs];
    const items_images = [{
        r: t("以图片编辑器打开"),
        v: "open"
    },
        {r: t(`${user_base_info?.user_data?.not_pre_show_image ? t("开启") : t("关闭")} ${t("预览图片")}`), v: "pre"},
        ...must_needs];
    const {file_is_running} = use_file_to_running();

    const close = () => {
        setShowPrompt({show: false, type: '', overlay: false, data: {}});
    }


    const get_ab_path = ()=>{
        const path = UserBaseInfo.get_now_dir(user_base_info)
        let fp = path_join(path,decodeURIComponent(getRouterAfter('file', getRouterPath())))
        if(user_base_info.sys === SysEnum.win) {
            fp = fp.replaceAll("/", '\\')
        } else if(fp.includes("\\")) {
            fp = fp.replaceAll("\\", '/')
        }
        return path_join(fp,showPrompt.data.filename)
    }

    let div; // useEffect 是已经渲染过了再执行
    const pojo = showPrompt.data;
    const right_click = async (v, item) => {
        // 右键点击了某个选项
        close();
        switch (v) {
            case common_menu_type.open_text: {
                const name = showPrompt.data.filename;
                click_file({name, model: "text", size: showPrompt.data.size, opt_shell: true});
            }
                break;
            case common_menu_type.logviwer_text:
            case common_menu_type.logviwer_utf8:
            case common_menu_type.logviwer_utf16:
            case common_menu_type.logviwer_utf32:
            case common_menu_type.logviwer_gbk:
            case common_menu_type.logviwer_gb2312:
            case common_menu_type.logviwer_gb18030:
            // case common_menu_type.logviwer_usc2:
            case common_menu_type.logviwer_windows1252:
                // case common_menu_type.logviwer_big5:
                // case common_menu_type.logviwer_ios_8859_1:
            {
                set_file_log({show: true, fileName: showPrompt.data.filename, encoding: v})
            }
                break;
            case common_menu_type.run_workflow:
            case common_menu_type.stop_workflow:
            case common_menu_type.real_time_workflow: {
                if (v === common_menu_type.real_time_workflow) {
                    set_workflow_show({open: true, filename: showPrompt.data.filename});
                } else {
                    run_workflow(showPrompt.data.filename, v);
                }
            }
                break;
            case common_menu_type.run_real_time_workflow: {
                // 实时运行worlkflow
                await run_workflow(showPrompt.data.filename, common_menu_type.run_workflow);
                set_workflow_show({open: true, filename: showPrompt.data.filename});
            }
                break;
            case common_menu_type.run_workflow_by_pre_inputs: {
                const rsq = await fileHttp.post("workflow/get/pre_inputs", {path: `${getRouterAfter('file', getRouterPath())}${showPrompt.data.filename}`});
                let list: workflow_pre_input [] = rsq.data;
                const send_start_check = () => {
                    for (const it of list) {
                        if (it.required && !it.default) {
                            NotyFail(`${it.description} is required`);
                            return;
                        }
                    }
                }
                set_prompt_card({
                    open: true, title: "inputs", context_div: (
                        <div>
                            <div className="card-content">
                                {list.map((item, index) => {
                                    // @ts-ignore
                                    return <InputText key={index} placeholderOut={item.description} value={item.default} options={item.options}
                                                      handleInputChange={(value) => {
                                                          item.default = value
                                                      }}/>
                                })}
                            </div>

                            <div className="card-action">
                                <button className="button button--flat button--grey" onClick={() => {
                                    set_prompt_card({open: false});
                                }}>
                                    {t("取消")}
                                </button>
                                <button className="button button--flat" onClick={async () => {
                                    send_start_check();
                                    await run_workflow(showPrompt.data.filename, common_menu_type.run_workflow, list);
                                    set_prompt_card({open: false});
                                    set_workflow_show({open: true, filename: showPrompt.data.filename});
                                }}>
                                    {t("运行并实时查看")}
                                </button>
                                <button className="button button--flat" onClick={async () => {
                                    send_start_check();
                                    await run_workflow(showPrompt.data.filename, common_menu_type.run_workflow, list);
                                    set_prompt_card({open: false});
                                }}>
                                    {t("运行")}
                                </button>
                            </div>
                        </div>
                    )
                })
            }
                break;
            case common_menu_type.file_quick_cmd:
                setShellShow({
                    show: true,
                    path: getRouterAfter('file', getRouterPath()),
                    cmd: `${item.extra_value.cmd} ${showPrompt.data.filename} ${item.extra_value.params??""}\r`,
                })
                break;
            case common_menu_type.file_copy_name:
                copyToClipboard(showPrompt.data.filename)
                break;
            case common_menu_type.file_copy_now_path:
                copyToClipboard(path_join(decodeURIComponent(getRouterAfter('file', getRouterPath())),showPrompt.data.filename))
                break;
            case common_menu_type.file_copy_ab_path:
                copyToClipboard(get_ab_path())
                break;
            case    common_menu_type.sutdio : {
                set_studio({folder_path: showPrompt.data.path, name: showPrompt.data.filename});
                close();
            }
            break;
            case common_menu_type.folder_size_info: {
                ws.addMsg(CmdType.folder_size_info, (data) => {
                    set_folder_info_list_data([data.context[0], data.context[1]]);
                })
                const p = getRouterAfter('file', showPrompt.data.path);
                ws.sendData(CmdType.folder_size_info, {path: p})
                setShowPrompt({show: true, type: PromptEnum.FolderInfo, overlay: true, data: {}});
            }
            break;
            case common_menu_type.share_file:{
                const item = new file_share_item()
                item.path = get_ab_path()
                // item.left_hour = 0
                const save_item = async () => {
                    // 确定保存
                    const result = await settingHttp.post("add_share_file_list", item);
                    if (result.code === RCode.Sucess) {
                        NotySucess("添加成功")
                        set_prompt_card({open:false})
                        navigate(`/${routerConfig.share_list_setting_page}`);
                    }
                }
                set_prompt_card({
                    open: true,
                    title: "share file",
                    confirm:save_item,
                    context_div: (
                        <div className="card-content">
                            <InputText placeholderOut={t("路径")} value={item.path}
                                       handleInputChange={(value) => item.path = value}/>
                            <InputText placeholderOut={t("剩余过期时间（小时)")} value={item.left_hour}
                                       handleInputChange={(value) => item.left_hour = parseInt(value)}/>
                            <InputText placeholderOut={t("token(可以为空)")}
                                       handleInputChange={(value) => item.token = value}/>
                            <InputText placeholderOut={t("备注")}
                                       handleInputChange={(value) => item.note = value}/>
                        </div>
                    ),

                })
            }
            break;
            case common_menu_type.share_file_download:
                const url = fileHttp.getDownloadUrlV2(showPrompt.data.path, "share_download", {
                    share_id: showPrompt.data.share_id,
                    share_token: showPrompt.data.share_token
                });
                window.open(url);
                break;
        }
    }

    // 开始展示右键选项
    if(showPrompt.data?.is_share)  {
        // 拦截
        div = <div onWheel={() => {
            close();
        }}>
            <OverlayTransparent click={close} children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y}
                                                                      items={[
                                                                          {r: t("download"), v: common_menu_type.share_file_download}
                                                                      ]} click={right_click}/>}/>
        </div>
        return (div);
    }
    switch (pojo.type) {
        case FileTypeEnum.video:
            if (!user_base_info.sysSoftWare || !user_base_info.sysSoftWare[SysSoftware.ffmpeg] || !user_base_info.sysSoftWare[SysSoftware.ffmpeg].installed) {
                NotyFail("not ffmpeg")
                // setTimeout(()=>{
                //     close(); // 等下不然会报错 只要不是顺序的执行应都可以 0秒表示只是加入队列
                // },0)
                Promise.resolve().then(() => {
                    close(); // 这样也行 微队列
                });
                break;
            }
            div = <div onWheel={() => {
                close();
            }}>
                <VideoTrans/>
            </div>
            break;
        case FileTypeEnum.uncompress:
            div = <div onWheel={() => {
                close();
            }}>
                <UnCompress list={must_needs} click={right_click}/>
            </div>
            break;
        case FileTypeEnum.dev:
            div = <div onWheel={() => {
                close();
            }}>
                <DiskMountAction/>
            </div>
            break;
        case FileTypeEnum.image:
            div = <div onWheel={() => {
                close();
            }}>
                <OverlayTransparent click={close} children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y}
                                                                          items={items_images} click={async (v) => {
                    if (v == "open") {
                        set_image_editor({path: showPrompt.data.path, name: showPrompt.data.filename});
                    } else if (v == "pre") {
                        await userHttp.post(Http_controller_router.user_save_user_file_list_show_type, {
                            not_pre_show_image: !user_base_info?.user_data?.not_pre_show_image
                        });
                        await initUserInfo();
                        navigate(getRouterPath());
                    }
                    close();
                }}/>}/>
            </div>
            break;
        case FileTypeEnum.folder:
            div = <div onWheel={() => {
                close();
            }}>
                <OverlayTransparent click={close} children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y}
                                                                          items={items_folder} click={right_click}/>}/>
            </div>
            break;
        case FileTypeEnum.studio_file:
        case FileTypeEnum.studio_folder:
        case FileTypeEnum.directory:
            // 自定义的
            div = <div onWheel={() => {
                close();
            }}>
                <OverlayTransparent click={close}
                                    children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y}
                                                            pre_value={showPrompt.data.item_pre_value}
                                                            items={showPrompt.data.items}
                                                            click={showPrompt.data.textClick}/>}
                />
            </div>
            break;
        case FileTypeEnum.unknow:
        default: {
            if (pojo.filename.endsWith(".workflow.yml") || pojo.filename.endsWith(".act")) {
                if (file_is_running(pojo.filename)) {
                    items.unshift({r: t("停止") + " workflow", v: common_menu_type.stop_workflow})
                    items.unshift({r: t("实时查看") + " workflow", v: common_menu_type.real_time_workflow})
                } else {
                    items.unshift({
                        r: t("运行") + " workflow", v: common_menu_type.run_workflow, items: [
                            {r: t("运行并实时查看"), v: common_menu_type.run_real_time_workflow}, {
                                r: t("输入参数运行"),
                                v: common_menu_type.run_workflow_by_pre_inputs
                            }
                        ]
                    })
                }
            }
            div = <div onWheel={() => {
                close();
            }}>
                <OverlayTransparent click={close}
                                    children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y} items={items}
                                                            click={right_click}/>}/>
            </div>
        }
    }
    return (div);
}


