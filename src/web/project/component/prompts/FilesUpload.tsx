// ver:1.0
import React, {useEffect, useState} from 'react';
import {ActionButton} from "../../../meta/component/Button";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {useLocation, useNavigate} from "react-router-dom";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {useTranslation} from "react-i18next";
import {NotyFail} from "../../util/noty";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {FileInfoItemData, FileTypeEnum} from "../../../../common/file.pojo";
import {ws_file_upload_req} from "../../../../common/req/file.req";
import {fileHttp} from "../../util/config";
import {WsClient} from "../../../../common/frame/ws.client";
import {dir_upload_max_num_item} from "../../../../common/req/setting.req";
import {generateRandomHash} from "../../../../common/StringUtil";

// const all_wss_list: WsClient[] = [];
const readAsArrayBufferAsync = (chunk, reader) => {
    return new Promise((resolve, reject) => {
        reader.onload = () => {
            resolve(reader.result);  // 读取成功时返回 ArrayBuffer
        };
        reader.onerror = (error) => {
            reject(error);  // 读取失败时返回错误
        };
        reader.readAsArrayBuffer(chunk);  // 开始读取文件
    });
}

export function FilesUpload() {
    const {t} = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [open, setOpen] = React.useState(false);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [progresses, setProgresses] = useState<number[]>([]);
    const [progresses_speed, set_progresses_speed] = useState<number[]>([]);
    const [progresses_tip, set_progresses_tip] = useState<string[]>([]);
    const [speed, setSpeed] = useState(0);
    // const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    // const speedRef = useRef<{ totalLoaded: number; lastTime: number }>({ totalLoaded: 0, lastTime: Date.now() });
    const remaining = uploadFiles.length - (progresses?.filter(p => p >= 100).length || 0);

    function click() {
        setOpen(!open);
    }

    const send_ws = async (
                            wss, chunkData, file_path,
                           totalChunks, currentChunk, part_index,
                           total_part_size, part_size) => {
        const pojo = new WsData(CmdType.file_upload);
        pojo.bin_context = new Uint8Array(chunkData);
        const file_p = new ws_file_upload_req();
        file_p.file_path = file_path;
        file_p.total_chunk_index = totalChunks;
        file_p.chunk_index = currentChunk;
        file_p.part_count = part_index;
        file_p.total_part_size = total_part_size;
        file_p.parallel_done_num = part_size;
        pojo.context = file_p;
        // pojo.random_id = generateRandomHash(9)
        return wss.send(pojo);
    }

    const ws_upload_file = async (value: any, index: number, initialPath: string, dir_upload_max_num_value: dir_upload_max_num_item,all_wss_list: WsClient[] ) => {
        const part_size = dir_upload_max_num_value.ws_file_parallel_num; // 并发数量
        let upload_size = 0;
        const total_size = value.size;

        const file_p = new ws_file_upload_req();
        file_p.lastModified = value.lastModified;
        file_p.file_path = `${initialPath}${value.fullPath}`;
        file_p.parallel_done_num = part_size;
        file_p.is_dir = value.isDir;
        const ws_pre_data = (await ws.sendData(CmdType.file_upload_pre, file_p,true)).context as {
            upload_data_size: number
        };
        if(value.isDir || !ws_pre_data) {
            setProgresses(prev => {
                const newProgresses = [...prev];
                newProgresses[index] = 100;
                // console.log(percentCompleted)
                return newProgresses;
            });
            return;
        }
        // console.log(ws_pre_data)
        // console.log(value)
        if (ws_pre_data.upload_data_size > 0) {
            upload_size = ws_pre_data.upload_data_size;
            value = value.slice(ws_pre_data.upload_data_size);
        }
        // const all_wss_list: WsClient[] = [];
        if (all_wss_list.length < part_size) {
            for (let i = all_wss_list.length; i <= part_size; i++) {
                all_wss_list.push(new WsClient(window.location.host, (socket) => {
                    // const data = new WsData(CmdType.auth);
                    // data.context = {
                    //     Authorization: localStorage.getItem('token')
                    // }
                    //  // @ts-ignore
                    // socket.send(data.encode())
                }))
            }
        }

        // const chunkSize = 1024 * 1024 * 10; // 每块大小（5MB）
        const chunkSize = dir_upload_max_num_value.ws_file_block_mb_size;
        let file = value; // 假设 file 是你要上传的文件
        let totalChunks; // 总的块数
        let currentChunk = 0; // 当前块索引
        totalChunks = Math.ceil(file.size / chunkSize); // 将结果向上取整，确保有足够的块来包含文件的所有内容，即使最后一个块可能没有完全填满。
        // 上传文件的每一块
        const uploadChunk = async (file) => {
            const chunk = file.slice(currentChunk * chunkSize, (currentChunk + 1) * chunkSize); // 只是引用没有读取
            const reader = new FileReader();
            const chunkData = await readAsArrayBufferAsync(chunk, reader) as ArrayBuffer; // 当前块的数据
            // reader.onload = async (event) => {
            // 通过 WebSocket 发送每一块
            // const chunkData = event.target.result as ArrayBuffer;
            const d = new Uint8Array(chunkData);
            const size = Math.ceil(d.length / part_size);
            let part_index = 0;
            const list = [];
            const path = file_p.file_path;
            for (let i = 0; i < part_size; i++) {
                const start = part_index;
                const end = Math.min(start + chunkSize, d.length); // 确保不超出范围
                const chunk = d.slice(start, end);  // 获取当前分块
                part_index = end;  // 更新下一个块的起始位置
                list.push(send_ws(all_wss_list[i], chunk, path, totalChunks, currentChunk, i, size, part_size))
                // console.log(currentChunk,totalChunks)
            }

            let startTime = new Date().getTime();  // 用于记录开始时间
            let timeout;
            await Promise.all(list);
            upload_size += d.length;
            const timeElapsed = (new Date().getTime() - startTime) / 1000;  // 时间差（秒）
            // 计算传输的字节数
            // 计算网速（字节/秒）
            const speed = d.length / timeElapsed;  // 字节/秒

            // 转换成 KB/s 或 MB/s
            const speedInKBps = speed / (1024 * 1024);  // 转换为千字节每秒
            set_progresses_speed(prev => {
                const newProgresses = [...prev];
                newProgresses[index] = speedInKBps;
                return newProgresses;
            });

            // debugger;
            const percentCompleted = Math.round((upload_size / total_size) * 100);
            setProgresses(prev => {
                const newProgresses = [...prev];
                newProgresses[index] = percentCompleted;
                // console.log(percentCompleted)
                return newProgresses;
            });
            // 增加当前块索引，继续上传下一个块
            currentChunk++;
            // 如果还有更多块，继续上传
            if (currentChunk < totalChunks) {
                await uploadChunk(file);
            }

            // 防止网速停留为上次的速度
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                set_progresses_speed(prev => {
                    const newProgresses = [...prev];
                    newProgresses[index] = 0;
                    return newProgresses;
                });
            }, 1000);  // 1秒后重置速度为0
            // };
            // // 读取当前文件块
            // reader.readAsArrayBuffer(chunk);
        };
        await uploadChunk(file);

    }

    const uploadFile = async (value: any, index: number, initialPath: string) => {
        try {
            let startTime = new Date().getTime();  // 用于记录开始时间
            let previousLoaded = 0;  // 上一次的已加载字节数
            let timeout;

            await fileHttp.put(
                `${encodeURIComponent(`${initialPath}${value.fullPath}`)}?dir=${value.isDir ? 1 : 0}`,
                value,
                (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded / progressEvent.total) * 100);
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
                    timeout = setTimeout(() => {
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

    const up = async () => {
        const initialPath = `${getRouterAfter('file', getRouterPath())}`;

        setProgresses(uploadFiles.map(() => 0));
        set_progresses_speed(uploadFiles.map(() => 0));
        // speedRef.current = { totalLoaded: 0, lastTime: Date.now() };

        const result = await ws.sendData(CmdType.file_info, {
            type: FileTypeEnum.upload_folder,
            path: getRouterAfter('file', getRouterPath())
        },true);
        const v: FileInfoItemData = result.context;
        const MAX_CONCURRENT = v?.dir_upload_max_num_value?.user_upload_num === undefined ? 3 : v.dir_upload_max_num_value.user_upload_num;
        // const MAX_CONCURRENT = 3;  // 最大并发数 对于机械硬盘 3 个已经可以了
        let currentIndex = 0;
        let activeWorkers = 0;
        let hasError = false;

        const processNextFile = async (ok_index) => {
            // console.log(ok_index,"开始")
            const all_wss_list: WsClient[] = [];
            while (currentIndex < uploadFiles.length && !hasError) {
                const index = currentIndex++;
                activeWorkers++;
                // console.log(ok_index,index)
                try {
                    if (v?.dir_upload_max_num_value?.open_ws_file === true && uploadFiles[index].size >= v.dir_upload_max_num_value.ws_file_standard_size) {
                        // 开启了 并超过了最大值
                        await ws_upload_file(uploadFiles[index], index, initialPath, v.dir_upload_max_num_value,all_wss_list);
                    } else {
                        await uploadFile(uploadFiles[index], index, initialPath);
                    }
                } catch (e) {
                    hasError = true;
                } finally {
                    activeWorkers--;
                }
            }
            for (const it of all_wss_list) {
                it.unConnect(); // 关闭全部的ws
            }
        };

        const workers = Array(Math.min(MAX_CONCURRENT, uploadFiles.length))
            .fill(null)
            .map((v,index) => processNextFile(index));
        // const now = Date.now();
        Promise.all(workers)
            .then(() => {
                if (!hasError) {
                    setUploadFiles([]);
                    setShowPrompt({show: false, type: '', overlay: false, data: {}});
                    navigate(getRouterPath());
                    // console.log(`耗时${((Date.now() - now) / 1000).toFixed(2)}`)
                    // all_wss_list.map(v => {
                    //     v.unConnect(); // 关闭全部的ws
                    // })
                }
            })
            .catch(() => {
            });

    }

    useEffect(() => {
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
                    {/*<div className="upload-speed">{(progresses_speed.reduce((accumulator, currentValue) => accumulator + currentValue, 0)/progresses.length).toFixed(2)} MB/s</div>*/}
                </div>
                {open && (
                    <div className="card-content file-icons">
                        {uploadFiles.map((v: any, index) => (
                            <div className="file div-row" key={index}>
                                <div className="file-name" style={{fontSize: ".8rem"}}>
                                    {v.name}
                                    <span style={{
                                        paddingLeft: ".3rem",
                                        color: progresses[index] === 100 ? "green" : progresses[index] > 0 ? "var(--blue)" : "var(--surfaceSecondary)"
                                    }}>
                                        {`${progresses[index] || 0}% ${progresses_speed[index].toFixed(2)} MB/s  `}
                                    </span>
                                </div>
                                <div className="file-progress ">
                                    <div style={{width: `${progresses[index] || 0}%`}}></div>
                                </div>

                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}