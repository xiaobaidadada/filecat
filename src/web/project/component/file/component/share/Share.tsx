import React, {useEffect, useRef, useState} from "react";
import {Dashboard, FullScreenDiv} from "../../../../../meta/component/Dashboard";
import {CardFull} from "../../../../../meta/component/Card";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../../util/store";
import {
    FileListLoad_file_folder_for_file_share,
    FileListLoad_file_folder_for_local, FileListLoad_file_folder_for_local_by_page
} from "../../FileListLoad";
import {ActionButton, ButtonText} from "../../../../../meta/component/Button";
import {getFileFormat} from "../../../../../../common/FileMenuType";
import {getRouterAfter, getRouterPath, remove_router_tail} from "../../../../util/WebPath";
import {routerConfig} from "../../../../../../common/RouterConfig";
import {fileHttp} from "../../../../util/config";
import {RCode} from "../../../../../../common/Result.pojo";
import {InputText} from "../../../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {NotyFail} from "../../../../util/noty";
import {FileItemData} from "../../../../../../common/file.pojo";
import Header from "../../../../../meta/component/Header";
import {getFileNameByLocation, getFilesByIndexs} from "../../FileUtil";
import {workflow_dir_name} from "../../../../../../common/req/file.req";
import { getShortTime } from "../../../../util/common_util";
import { formatFileSize } from "../../../../../../common/ValueUtil";
import {user_click_file} from "../../../../util/store.util";

type FileItem = FileItemData

type ShareData = {
    is_dir: boolean;
    name?: string;
    size?: number;
    show_mtime?: string;
    items?: FileItem[];
};

export default function Share() {
    const [data, setData] = useState<ShareData | null>(null);
    const share_id = useRef();
    const share_token = useRef();
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const {t} = useTranslation();
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const {click_file} = user_click_file();


    const get_file = async () => {
        const r = await fileHttp.post(`share`, {
            id: share_id.current, token: share_token.current,
        })
        if (r.code === RCode.Sucess) {
            const p: ShareData = {
                is_dir: r.data.is_dir
            }
            p.items = r.data.files ?? []
            for (const f of p.items) {
                f.show_mtime = f.mtime ? getShortTime(f.mtime) : "";
                f.size = formatFileSize(f.size);
            }
            if (!p.is_dir) {
                const f = r.data.files[0]
                p.name = f.name
                p.size = f.size;
                p.show_mtime = f.show_mtime
            }
            setData(p)
            localStorage.setItem(`file_share_token_${share_id.current}`, share_token.current)
        } else if (r.code === RCode.need_token_share) {
            localStorage.removeItem(`file_share_token_${share_id.current}`);
            NotyFail(`需要正确的访问token`)
            set_prompt_card({
                open: true,
                title: "share file",
                confirm: () => {
                    set_prompt_card({open: false})
                    get_file()
                },
                context_div: (
                    <div className="card-content">
                        <InputText placeholderOut={t("请输入访问token")} value={''}
                                   handleInputChange={(value) => {
                                       share_token.current = value
                                   }}/>
                    </div>
                ),

            })
        }
    }
    /** mock：替换为真实接口 */
    useEffect(() => {
        const id = remove_router_tail(`${getRouterAfter(routerConfig.share, getRouterPath())}`)
        share_id.current = id;
        share_token.current = localStorage.getItem(`file_share_token_${id}`)
        get_file()
        // setTimeout(() => {
        //     setData({
        //         is_dir: true,
        //         name: "shared-folder",
        //         size:"12mb"
        //     });
        // }, 300);
    }, []);

    if (!data) {
        return (
            <FullScreenDiv isFull>
                <div className="common-box common-box-center">Loading...</div>
            </FullScreenDiv>
        );
    }

    const clickBlank = (event) => {
        if (event.target === event.currentTarget) {
            setSelectList([])
            setClickList([])
        }
    }

    function downloadFile() {
        const file_paths:string[] = []
        // console.log(data)
        // return
        for (let i = 0; i < selectList.length; i++) {
            const file = data.items[selectList[i]];
            file_paths.push(encodeURIComponent(file.path))
        }
        const url = fileHttp.getDownloadUrlV2(file_paths, "share_download", {
            share_id: share_id.current,
            share_token: share_token.current
        });
        window.open(url);
    }

    return (
        <React.Fragment>
            <Header left_children={<>
                <h2>
                    Share {data.is_dir?"Folder":"File"}
                </h2>
            </>}>
                {selectList.length > 0 && <ActionButton icon={"download"} title={t("下载")} onClick={downloadFile}/>}
            </Header>
            <Dashboard>
                <FullScreenDiv isFull>
                    <div className="common-box ">
                        {
                            !data.is_dir ?
                                <CardFull>
                                    <div style={{
                                        height: "25rem",

                                    }} className="common-box common-box-center">
                                        <div className={"file-icons"}>
                                            <div
                                                data-type={getFileFormat(data.name)}
                                                data-dir={data.is_dir}
                                                aria-label={data.name}
                                            >
                                                <i
                                                    className="material-icons"
                                                    style={{fontSize: "10rem", display: "inline-block", lineHeight: 1}}
                                                    aria-label={data.name}  // 注意 aria-label 放在 <i> 上
                                                >
                                                </i>
                                            </div>
                                        </div>


                                        <div className="">{data.name}</div>

                                        <div className="">
                                            {data.size}
                                        </div>

                                        <div className="">
                                            {data.show_mtime}
                                        </div>

                                        <ButtonText text={"download"} clickFun={() => {
                                            const url = fileHttp.getDownloadUrlV2(data.items[0].path, "share_download", {
                                                share_id: share_id.current,
                                                share_token: share_token.current
                                            });
                                            window.open(url);
                                        }}/>

                                        <ButtonText text={"preview"} clickFun={() => {
                                            const item = data.items[0]
                                            click_file({
                                                file_path: item.path,
                                                file_url: fileHttp.getDownloadUrlV2(item.path,"share_download", {
                                                    share_id: share_id.current,
                                                    share_token: share_token.current
                                                }),
                                                name:item.name, size: item.origin_size,
                                                opt_shell: true,
                                                mtime: item.mtime,
                                                not_type_tip:t("未知类型，请下载查看")
                                            });
                                        }}/>
                                    </div>
                                </CardFull>
                                :
                                (
                                    <FileListLoad_file_folder_for_file_share share={
                                        {
                                            share_id: share_id.current,
                                            share_token: share_token.current,
                                        }
                                    } handleContextMenu={() => {
                                    }} file_list={data.items} clickBlank={clickBlank}/>
                                )
                        }
                    </div>
                </FullScreenDiv>
            </Dashboard>
        </React.Fragment>
    );
}
