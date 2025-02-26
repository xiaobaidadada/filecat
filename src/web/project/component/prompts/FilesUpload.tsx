// ver:1.0
import React, { useEffect, useRef, useState } from 'react';
import { ActionButton } from "../../../meta/component/Button";
import { useRecoilState } from "recoil";
import { $stroe } from "../../util/store";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import { fileHttp } from "../../util/config";
import { getNewDeleteByList } from "../../../../common/ListUtil";
import { getRouterAfter, getRouterPath } from "../../util/WebPath";
import { useTranslation } from "react-i18next";
import { NotyFail } from "../../util/noty";
import {ws} from "../../util/ws";
import {CmdType} from "../../../../common/frame/WsData";
import {FileInfoItemData, FileTypeEnum} from "../../../../common/file.pojo";

export function FilesUpload() {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const [user_base_info,setUser_base_info] = useRecoilState($stroe.user_base_info);

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [open, setOpen] = React.useState(false);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [progresses, setProgresses] = useState<number[]>([]);
    const [progresses_speed, set_progresses_speed] = useState<number[]>([]);
    const [speed, setSpeed] = useState(0);
    // const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    // const speedRef = useRef<{ totalLoaded: number; lastTime: number }>({ totalLoaded: 0, lastTime: Date.now() });
    const remaining = uploadFiles.length - (progresses?.filter(p => p >= 100).length || 0);

    function click() {
        setOpen(!open);
    }

    const uploadFile = async (value: any, index: number,initialPath:string) => {
        try {
            let startTime = new Date().getTime();  // 用于记录开始时间
            let previousLoaded = 0;  // 上一次的已加载字节数
            let timeout;
            await fileHttp.put(
                `${encodeURIComponent(`${initialPath}${value.fullPath}`)}?dir=${value.isDir?1:0}`,
                value,
                (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setProgresses(prev => {
                        const newProgresses = [...prev];
                        newProgresses[index] = percentCompleted;
                        return newProgresses;
                    });

                    const currentTime = new Date().getTime();  // 当前时间（毫秒）
                    const loaded = progressEvent.loaded;  // 已上传字节数
                    // const total = progressEvent.total;  // 文件总字节数
                    // debugger
                    // 计算时间差（秒）
                    // if (!startTime) startTime = currentTime;  // 初始化开始时间
                    const timeElapsed = (currentTime - startTime) / 1000;  // 时间差（秒）
                    startTime = currentTime;

                    // 计算传输的字节数
                    const bytesTransferred = loaded - previousLoaded;

                    // 计算网速（字节/秒）
                    const speed = bytesTransferred / timeElapsed;  // 字节/秒

                    // 转换成 KB/s 或 MB/s
                    const speedInKBps = speed / (1024 * 1024);  // 转换为千字节每秒

                    // 更新 UI 显示网速
                    // speedDisplay.textContent = `网速: ${speedInKBps.toFixed(2)} KB/s`;
                    set_progresses_speed(prev => {
                        const newProgresses = [...prev];
                        newProgresses[index] = speedInKBps;
                        return newProgresses;
                    });
                    // setSpeed(speedInKBps.toFixed(2))

                    // 更新已加载字节数
                    previousLoaded = loaded;

                    // 防止网速停留为上次的速度
                    if (timeout) clearTimeout(timeout);
                    timeout = setTimeout(() =>
                    {
                        set_progresses_speed(prev => {
                            const newProgresses = [...prev];
                            newProgresses[index] = 0;
                            return newProgresses;
                        });
                    }, 1000);  // 1秒后重置速度为0
                }
            );
        } catch (e) {
            NotyFail(`上传:${value.name} 文件出错!`);
            throw e;
        }
    };

    const up = async ()=>{
        const initialPath = `${getRouterAfter('file', getRouterPath())}`;

        setProgresses(uploadFiles.map(() => 0));
        set_progresses_speed(uploadFiles.map(() => 0));
        // speedRef.current = { totalLoaded: 0, lastTime: Date.now() };

        const result = await ws.sendData(CmdType.file_info, {
            type: FileTypeEnum.upload_folder,
            path: getRouterAfter('file', getRouterPath())
        });
        const v:FileInfoItemData = result.context;
        const MAX_CONCURRENT = v.max_upload_num === undefined ? 3 : v.max_upload_num;
        // const MAX_CONCURRENT = 3;  // 最大并发数 对于机械硬盘 3 个已经可以了
        let currentIndex = 0;
        let activeWorkers = 0;
        let hasError = false;

        const processNextFile = async () => {
            while (currentIndex < uploadFiles.length && !hasError) {
                const index = currentIndex++;
                activeWorkers++;
                try {
                    await uploadFile(uploadFiles[index], index, initialPath);
                } catch (e) {
                    hasError = true;
                } finally {
                    activeWorkers--;
                }
            }
        };

        const workers = Array(Math.min(MAX_CONCURRENT, uploadFiles.length))
            .fill(null)
            .map(() => processNextFile());

        Promise.all(workers)
            .then(() => {
                if (!hasError) {
                    setUploadFiles([]);
                    setShowPrompt({ show: false, type: '', overlay: false, data: {} });
                    navigate(getRouterPath());
                }
            })
            .catch(() => {});

    }

    useEffect( () => {
        up();
        return () => {
            // if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return (
        <div className="upload-files">
            <div className="card floating">
                <div className="card-title">
                    <h2>{remaining}/{uploadFiles.length}</h2>
                    <ActionButton 
                        icon={open ? "keyboard_arrow_down" : "keyboard_arrow_up"}
                        title={"Toggle file upload list"} 
                        onClick={click}
                    />
                    <div className="upload-speed">{(progresses_speed.reduce((accumulator, currentValue) => accumulator + currentValue, 0)/progresses.length).toFixed(2)} MB/s</div>
                </div>
                {open && (
                    <div className="card-content file-icons">
                        {uploadFiles.map((v: any, index) => (
                            <div className="file div-row" key={index}>
                                <div className="file-name" style={{fontSize:".8rem"}}>
                                    {v.name}
                                    <span style={{
                                        paddingLeft:".3rem",
                                        color:progresses[index]===100?"green":progresses[index]>0?"var(--blue)":"var(--surfaceSecondary)"}}>
                                        {`${progresses[index] || 0}% ${progresses_speed[index].toFixed(2)} MB/s  `}
                                    </span>
                                </div>
                                <div className="file-progress ">
                                    <div style={{ width: `${progresses[index]  || 0}%` }}></div>
                                </div>

                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}