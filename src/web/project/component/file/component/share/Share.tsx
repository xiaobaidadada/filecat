import React, {useEffect, useMemo, useRef, useState} from "react";
import {Dashboard, FullScreenDiv} from "../../../../../meta/component/Dashboard";
import {CardFull} from "../../../../../meta/component/Card";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../../util/store";
import {
    FileListLoad_file_folder_for_file_share,
    FileListLoad_file_folder_for_local, FileListLoad_file_folder_for_local_by_page
} from "../../FileListLoad";
import {ActionButton, ButtonText, Icon} from "../../../../../meta/component/Button";
import {getFileFormat} from "../../../../../../common/FileMenuType";
import {getRouterAfter, getRouterPath, remove_router_tail} from "../../../../util/WebPath";
import {routerConfig} from "../../../../../../common/RouterConfig";
import {fileHttp} from "../../../../util/config";
import {RCode} from "../../../../../../common/Result.pojo";
import {InputText} from "../../../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {NotyFail, NotySucess} from "../../../../util/noty";
import {FileItemData} from "../../../../../../common/file.pojo";
import Header from "../../../../../meta/component/Header";
import {
    getFileNameByLocation,
    getFilesByIndexs,
    unsing_switch_grid_view,
    use_share_preview,
    useUpdateUrlParams
} from "../../FileUtil";
import {workflow_dir_name} from "../../../../../../common/req/file.req";
import { getShortTime } from "../../../../util/common_util";
import { formatFileSize } from "../../../../../../common/ValueUtil";
import {user_click_file} from "../../../../util/store.util";
import {copyToClipboard} from "../../../../util/FunUtil";
import {DirListShowTypeEmum} from "../../../../../../common/req/user.req";
import {getNextByLoop} from "../../../../../../common/ListUtil";
import {useSearchParams} from "react-router-dom";

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
    const share_id = useRef<string>("");
    const share_token = useRef<string>("");
    const [prompt_card, set_prompt_card] = useRecoilState($stroe.prompt_card);
    const [share_sort_type, setShareSortType] = useRecoilState($stroe.share_sort_type);
    const {t} = useTranslation();
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const {click_file} = user_click_file();
    const [searchParams] = useSearchParams()
    const updateParams = useUpdateUrlParams();
    const share_review = use_share_preview()

    const  switchGridView = unsing_switch_grid_view(true)

    const display_items = useMemo(() => {
        const items = [...(data?.items ?? [])];
        const get_time = (item: FileItem) => Number(item.mtime ?? 0);
        if (share_sort_type === DirListShowTypeEmum.time_minx_max) {
            items.sort((a, b) => get_time(a) - get_time(b));
        } else if (share_sort_type === DirListShowTypeEmum.time_max_min) {
            items.sort((a, b) => get_time(b) - get_time(a));
        }
        return items;
    }, [data?.items, share_sort_type]);


    const get_file = async () => {
        const r = await fileHttp.post(`share`, {
            id: share_id.current, token: share_token.current,
        })
        if (r.code === RCode.Success) {
            const p: ShareData = {
                is_dir: r.data.is_dir
            }
            p.items = r.data.files ?? []
            for (const f of p.items) {
                f.origin_size = f.size;
                f.show_mtime = f.mtime ? getShortTime(f.mtime) : "";
                f.size = formatFileSize(f.size);
            }
            if (!p.is_dir) {
                const f = r.data.files[0]
                p.name = f.name
                p.size = f.size;
                p.show_mtime = f.show_mtime
            }
            localStorage.setItem(`file_share_token_${share_id.current}`, share_token.current)
            const share_preview_file_name = searchParams.get("share_preview_file_name");
            if(share_preview_file_name) {
                try {
                    const one = r.data.files.find(v=>v.name === share_preview_file_name);
                    click_file({
                        file_path: one.path, file_url: fileHttp.getDownloadUrlV2(one.path,"share_download", {
                            share_id: share_id.current,
                            share_token: share_token.current
                        }),
                        name:one.name, size: one.origin_size, opt_shell: true, mtime: one.mtime,
                        not_type_tip:t("未知类型，请下载查看"),
                        close:()=>{
                            updateParams('share_preview_file_name',null)
                        }
                    });
                } catch (e) {
                    NotyFail(e?.message || e);
                }
            } else {
                setData(p)
            }
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
    }, [searchParams]);

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

    const switchTimeSort = () => {
        const next = getNextByLoop([
            DirListShowTypeEmum.time_max_min,
            DirListShowTypeEmum.time_minx_max,
            DirListShowTypeEmum.defualt,
        ], share_sort_type) as DirListShowTypeEmum;
        setShareSortType(next);
        setSelectList([])
        setClickList([])
    }

    function downloadFile() {
        const file_paths:string[] = []
        // console.log(data)
        // return
        for (let i = 0; i < selectList.length; i++) {
            const file = display_items[selectList[i]];
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
                {data.is_dir && <ActionButton icon={"grid_view"} title={t("切换样式")} onClick={switchGridView}/>}
                {data.is_dir && <ActionButton icon={"schedule"} title={share_sort_type === DirListShowTypeEmum.time_minx_max ? t("时间逆序") : t("时间顺序")} onClick={switchTimeSort}/>}
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

                                                <Icon icon={''} style={{fontSize: "10rem", display: "inline-block", lineHeight: 1}} aria_label={data.name} />
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
                                            const item = display_items[0];
                                            const url = fileHttp.getDownloadUrlV2(item.path, "share_download", {
                                                share_id: share_id.current,
                                                share_token: share_token.current
                                            });
                                            window.open(url);
                                        }}/>

                                        <ButtonText text={"copy url"} clickFun={() => {
                                            const item = display_items[0];
                                            const url = fileHttp.getDownloadUrlV2(item.path, "share_download", {
                                                share_id: share_id.current,
                                                share_token: share_token.current
                                            });
                                            const f = fileHttp.get_full_url(url)
                                            copyToClipboard(f)
                                            NotySucess(f)
                                        }}/>

                                        <ButtonText text={"preview"} clickFun={() => {
                                            const item = display_items[0]
                                            share_review(item.name)
                                            // click_file({
                                            //     file_path: item.path,
                                            //     file_url: fileHttp.getDownloadUrlV2(item.path,"share_download", {
                                            //         share_id: share_id.current,
                                            //         share_token: share_token.current
                                            //     }),
                                            //     name:item.name, size: item.origin_size,
                                            //     opt_shell: true,
                                            //     mtime: item.mtime,
                                            //     not_type_tip:t("未知类型，请下载查看")
                                            // });
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
                                    }} file_list={display_items} clickBlank={clickBlank}/>
                                )
                        }
                    </div>
                </FullScreenDiv>
            </Dashboard>
        </React.Fragment>
    );
}
