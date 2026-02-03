import React, {useEffect, useRef, useState} from "react";
import {Dashboard, FullScreenDiv} from "../../../../meta/component/Dashboard";
import {CardFull} from "../../../../meta/component/Card";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {FileListLoad_file_folder_for_local, FileListLoad_file_folder_for_local_by_page} from "../FileListLoad";
import {ButtonText} from "../../../../meta/component/Button";
import {getFileFormat} from "../../../../../common/FileMenuType";
import {getRouterAfter, getRouterPath, remove_router_tail} from "../../../util/WebPath";
import {routerConfig} from "../../../../../common/RouterConfig";
import {fileHttp} from "../../../util/config";
import {RCode} from "../../../../../common/Result.pojo";
import {file_share_item} from "../../../../../common/req/file.req";

type FileItem = file_share_item

type ShareData = {
    is_dir: boolean;
    name?: string;
    size?: number;
    items?: FileItem[];
};

export default function Share() {
    const [data, setData] = useState<ShareData | null>(null);
    const share_id = useRef();
    const share_token = useRef();

    const get_file = async ()=>{
        const id = remove_router_tail(`${getRouterAfter(routerConfig.share, getRouterPath())}`)
        share_id.current = id;
        const r = await fileHttp.post(`share`,{
            id
        })
        if(r.code === RCode.Sucess) {
            const p :ShareData = {
                is_dir: r.data.is_dir
            }
            if(!p.is_dir) {
                p.name = r.data.files[0].name
            }
            p.items = r.data.files ??[]
            setData(p)
        }
    }
    /** mock：替换为真实接口 */
    useEffect(() => {
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

    return (
        <Dashboard>
            <FullScreenDiv isFull>
                <div className="common-box ">
                    {
                        !data.is_dir ?
                            <CardFull>
                                <div style={{
                                    height: "25rem",

                                }} className="common-box common-box-center">
                                    <h2 className="">
                                        {data.is_dir ? "下载文件夹" : "下载文件"}
                                    </h2>

                                    <div className={"file-icons"}>
                                        <div
                                            data-type={getFileFormat(data.name)}
                                            data-dir={data.is_dir}
                                            aria-label={data.name}
                                        >
                                            <i
                                                className="material-icons"
                                                style={{ fontSize: "10rem", display: "inline-block", lineHeight: 1 }}
                                                aria-label={data.name}  // 注意 aria-label 放在 <i> 上
                                            >
                                            </i>
                                        </div>
                                    </div>



                                    <div className="">{data.name}</div>

                                    {!data.is_dir && (
                                        <div className="">
                                            大小：{data.size} bytes
                                        </div>
                                    )}

                                    <ButtonText text={"download"} clickFun={()=>{
                                        const url = fileHttp.getDownloadUrlV2(data.items[0].path,"share_download",{
                                            share_id:share_id.current,
                                            share_token:share_token.current
                                        });
                                        window.open(url);
                                    }}/>
                                </div>
                            </CardFull>
                            :
                            (
                                <FileListLoad_file_folder_for_local_by_page handleContextMenu={() => {
                                }} list={data.items} clickBlank={()=>{

                                }}                                />
                            )
                    }
                </div>
            </FullScreenDiv>
        </Dashboard>
    );
}
