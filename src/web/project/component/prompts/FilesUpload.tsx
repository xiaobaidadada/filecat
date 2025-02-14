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

export function FilesUpload() {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [open, setOpen] = React.useState(false);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [progresses, setProgresses] = useState<number[]>([]);
    const [speed, setSpeed] = useState(0);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const speedRef = useRef<{ totalLoaded: number; lastTime: number }>({ totalLoaded: 0, lastTime: Date.now() });
    const remaining = uploadFiles.length - (progresses?.filter(p => p >= 100).length || 0);

    function click() {
        setOpen(!open);
    }

    const uploadFile = async (value: any, index: number,initialPath:string) => {
        try {
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

                    const now = Date.now();
                    const timeDiff = (now - speedRef.current.lastTime) / 1000;
                    speedRef.current.totalLoaded += progressEvent.loaded - (speedRef.current.totalLoaded / uploadFiles.length);
                    
                    if (timeDiff > 0.5) {
                        const uploadSpeed = (speedRef.current.totalLoaded / (1024 * 1024)) / timeDiff;
                        setSpeed(parseFloat(uploadSpeed.toFixed(2)));
                        speedRef.current = { totalLoaded: 0, lastTime: now };
                    }

                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                    timeoutRef.current = setTimeout(() => setSpeed(0), 1000);
                }
            );
        } catch (e) {
            NotyFail(`上传:${value.name} 文件出错!`);
            throw e;
        }
    };

    useEffect(() => {
        const initialPath = `${getRouterAfter('file', getRouterPath())}`;
        
        setProgresses(uploadFiles.map(() => 0));
        speedRef.current = { totalLoaded: 0, lastTime: Date.now() };

        const MAX_CONCURRENT = 20;  // 最大并发数
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
                    navigate(getRouterPath());
                    setUploadFiles([]);
                    setShowPrompt({ show: false, type: '', overlay: false, data: {} });
                }
            })
            .catch(() => {});

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
                    <div className="upload-speed">{speed} MB/s</div>
                </div>
                {open && (
                    <div className="card-content file-icons">
                        {/* 修改这里：过滤已完成的文件 */}
                        {uploadFiles.map((v: any, index) => {
                            if (progresses[index] >= 100) return null;
                            return (
                                <div className="file" key={index}>
                                    <div className="file-name">
                                        {v.name}
                                    </div>
                                    <div className="file-progress">
                                        <div style={{ width: `${progresses[index] || 0}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}