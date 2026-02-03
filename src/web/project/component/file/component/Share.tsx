import React, {useEffect, useState} from "react";
import {Column, Dashboard, FullScreenDiv, Row} from "../../../../meta/component/Dashboard";
import {CardFull} from "../../../../meta/component/Card";
import {Table} from "../../../../meta/component/Table";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {FileListLoad_file_folder_for_local} from "../FileListLoad";
import {ButtonText} from "../../../../meta/component/Button";
import {FileTypeEnum} from "../../../../../common/file.pojo";
import {getByList} from "../../../../../common/ListUtil";
import {getFileFormat} from "../../../../../common/FileMenuType";

type FileItem = {
    name: string;
    size: number;
    type: "file" | "dir";
};

type ShareData = {
    is_dir: boolean;
    name: string;
    size?: number;
    items?: FileItem[];
};

export default function Share() {
    const [data, setData] = useState<ShareData | null>(null);
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);

    /** mock：替换为真实接口 */
    useEffect(() => {
        setTimeout(() => {
            setData({
                is_dir: true,
                name: "shared-folder",
                size:"12mb"
            });
        }, 300);
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

                                    <ButtonText text={"download"}/>
                                </div>
                            </CardFull>
                            :
                            (
                                <FileListLoad_file_folder_for_local handleContextMenu={() => {
                                }} file_list={nowFileList.files}
                                                                    folder_list={nowFileList.folders}
                                                                    clickBlank={() => {
                                                                    }}/>
                            )
                    }
                </div>
            </FullScreenDiv>
        </Dashboard>
    );
}
