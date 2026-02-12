import Stream from "node:stream";
import WebSocket from "ws";
import {settingService} from "../setting/setting.service";


export class VideoService {


    // rtsp 转换的flv视频流暂时不无法复用，因为找不到文件头了，只有最开始的时候才会发送文件头，以后可以先把文件头保存下来。
    public getRtsp(url,ws:WebSocket) {
        // let url = `rtsp://${cur.account}:${cur.password}@${cur.nvrAddress}:${cur.nvrPortNum}/Streaming/tracks/${cur.channelNum}/?starttime=${starttime}Z&endtime=${endtime}Z`
        // 配置 FFmpeg 命令
        const stream = new Stream.PassThrough();
        const command = settingService.getFfmpeg()(url)
            .inputOptions('-rtsp_transport', 'tcp') // 使用 TCP 传输
            .outputFormat('flv') // 输出格式为 FLV
            .videoCodec('copy') // 直接复制视频数据
            .videoCodec('libx264') // 使用 H.264 编解码器
            .audioCodec('aac') // 音频编解码器
            .on('start', (commandLine) => {
                console.log('Spawned FFmpeg with command: ' + commandLine);
            })
            .on('error', (err) => {
                console.error('rtsp错误 ' ,url, err.message);
                ws.close();
            }).on('end', () => {
                console.error('rtsp结束',url);
                ws.close();
            }).
            pipe(stream);
        stream.on('data', (chunk) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(chunk);
            } else {
                command.end();
            }
        });
        ws.on('close',()=>{
            command.end();
        })
    }
}

export const videoService = new VideoService();
