import axios, { AxiosRequestConfig } from 'axios';
import * as querystring from 'querystring';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';
import path from 'path';
import { FileUtil } from '../../main/domain/file/FileUtil';

// 全局代理地址获取器（由 main 层注入，避免 common 层依赖 main 层）
let proxy_getter: () => string = () => '';

export class HttpRequest {

  /** 注入全局代理地址获取函数 */
  public static set_proxy_getter(fn: () => string) {
    proxy_getter = fn;
  }

  /** 获取当前代理地址，空表示不启用 */
  public static get_proxy(): string | undefined {
    try {
      const p = proxy_getter();
      if (p) return p;
    } catch (e) {
      console.log(e);
    }
    return undefined;
  }

  /** 构建 axios 配置，自动注入代理 agent */
  private static build_config(config: AxiosRequestConfig): AxiosRequestConfig {
    const proxy = HttpRequest.get_proxy();
    if (proxy) {
      const Agent = HttpsProxyAgent;
      const agent = new Agent(proxy as any);
      config.httpAgent = agent;
      config.httpsAgent = agent;
      config.proxy = false; // 禁用 axios 内置代理，使用自定义 agent
    }
    return config;
  }

  /** POST 请求，isForm 为 true 时以 x-www-form-urlencoded 发送 */
  public static async post(url: string, body: {}, isForm = false, headers = {}): Promise<any> {
    try {
      const config = HttpRequest.build_config({ headers: { ...headers } });
      const data = isForm ? querystring.stringify(body as any) : body;
      if (isForm) {
        (config.headers as any)['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      const res = await axios.post(url, data, config);
      return res.status === 200 ? res.data : null;
    } catch (e) {
      console.error(`[HttpRequest] post 失败: ${url}`, e);
      return null;
    }
  }

  /** GET 请求 */
  public static async get(url: string, params?: {}, timeout?: number): Promise<any> {
    try {
      const config = HttpRequest.build_config({ params });
      if (timeout) config.timeout = timeout;
      const res = await axios.get(url, config);
      return res.status === 200 ? res.data : null;
    } catch (e) {
      console.error(`[HttpRequest] get 失败: ${url}`, e);
      return null;
    }
  }

  /** 通用请求，返回完整 AxiosResponse（自动走代理） */
  public static async request(config: AxiosRequestConfig): Promise<any> {
    HttpRequest.build_config(config);
    return axios(config);
  }

  /** Range 分片大小（512KB），避免代理在长连接传输中断开 */
  private static readonly RANGE_CHUNK_SIZE = 512 * 1024;

  /** 解析文件名：优先 content-disposition，其次 URL pathname */
  private static parse_filename(headers: any, urlObj: URL): string {
    const disposition = headers?.['content-disposition'];
    if (disposition) {
      const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^;]+)/i);
      if (match?.[1]) {
        try {
          return decodeURIComponent(match[1].replace(/^"/, '').replace(/"$/, ''));
        } catch {
          return match[1];
        }
      }
    }
    const base = path.basename(urlObj.pathname);
    if (base && base !== '/' && base !== '.') return base;
    return `download_${Date.now()}`;
  }

  /** 下载单个分片（bytes=start-end） */
  private static async download_chunk(url: string, start: number, end: number): Promise<Buffer> {
    const config = HttpRequest.build_config({
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'node',
        'Accept': '*/*',
        'Range': `bytes=${start}-${end}`,
      },
      maxRedirects: 5,
    });
    const res = await axios(url, config);
    if (res.status !== 206 && res.status !== 200) {
      throw new Error(`分片下载失败: HTTP ${res.status}`);
    }
    return Buffer.from(res.data);
  }

  /** 下载文件到本地，返回文件路径（带进度回调） */
  public static async download_file(
    url: string,
    dirPath: string,
    on_progress?: (value: number) => void
  ): Promise<string> {
    try {
      await FileUtil.mkdirSync(dirPath, { recursive: true });

      let urlObj: URL;
      try {
        urlObj = new URL(encodeURI(url));
      } catch {
        throw new Error('非法 URL: ' + url);
      }

      // 获取文件信息（一次 HEAD 请求，同时拿大小和文件名）
      let info: { size: number; acceptRanges: boolean; finalUrl: string };
      let headHeaders: any = {};
      try {
        const headConfig = HttpRequest.build_config({ method: 'HEAD', headers: { 'User-Agent': 'node', 'Accept': '*/*' }, maxRedirects: 5 });
        const headRes = await axios(url, headConfig);
        headHeaders = headRes.headers;
        info = {
          size: Number(headRes.headers['content-length'] || 0),
          acceptRanges: (headRes.headers['accept-ranges'] || '').toLowerCase().includes('bytes'),
          finalUrl: headRes.config?.url || url,
        };
      } catch {
        // HEAD 失败时回退到普通流式下载
        info = { size: 0, acceptRanges: false, finalUrl: url };
      }

      const fileName = HttpRequest.parse_filename(headHeaders, urlObj);

      const filePath = path.resolve(dirPath, fileName);

      // 如果支持 Range 且文件大于一个分片，使用分片下载
      if (info.acceptRanges && info.size > HttpRequest.RANGE_CHUNK_SIZE) {
        return await HttpRequest.download_with_range(url, filePath, info.size, on_progress);
      }

      // 不支持 Range，回退到普通流式下载
      return await HttpRequest.download_stream(url, filePath, on_progress);
    } catch (e) {
      console.error(`[HttpRequest] download_file 失败: ${url}`, e);
      throw e;
    }
  }

  /** 分片下载（Range 请求），避免代理在长连接中途断开 */
  private static async download_with_range(
    url: string,
    filePath: string,
    total: number,
    on_progress?: (value: number) => void
  ): Promise<string> {
    const ws = fs.createWriteStream(filePath);
    let downloaded = 0;
    let lastPercent = -1;

    try {
      while (downloaded < total) {
        const end = Math.min(downloaded + HttpRequest.RANGE_CHUNK_SIZE - 1, total - 1);
        const chunk = await HttpRequest.download_chunk(url, downloaded, end);
        ws.write(chunk);
        downloaded += chunk.length;
        if (total > 0) {
          const percent = Math.floor((downloaded / total) * 100);
          if (percent !== lastPercent) {
            lastPercent = percent;
            on_progress?.(percent);
          }
        }
      }
      on_progress?.(100);
      ws.end();
      // 等待写入完成
      await new Promise<void>((resolve, reject) => {
        ws.on('finish', resolve);
        ws.on('error', reject);
      });
      return filePath;
    } catch (e) {
      ws.destroy();
      try { if (await FileUtil.access(filePath)) await FileUtil.remove(filePath); } catch {}
      throw e;
    }
  }

  /** 普通流式下载（不支持 Range 时的回退方案） */
  private static async download_stream(
    url: string,
    filePath: string,
    on_progress?: (value: number) => void
  ): Promise<string> {
    const config = HttpRequest.build_config({
      responseType: 'stream',
      headers: { 'User-Agent': 'node', 'Accept': '*/*' },
      maxRedirects: 5,
    });
    const response = await axios(url, config);
    if (response.status !== 200 && response.status !== 206) {
      throw new Error(`下载失败: ${response.status}`);
    }

    const fileStream = fs.createWriteStream(filePath);
    const total = Number(response.headers['content-length'] || 0);
    let downloaded = 0;
    let lastPercent = -1;

    response.data.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      if (total > 0) {
        const percent = Math.floor((downloaded / total) * 100);
        if (percent !== lastPercent) {
          lastPercent = percent;
          on_progress?.(percent);
        }
      }
    });

    response.data.on('error', async (e: Error) => {
      fileStream.destroy();
      if (await FileUtil.access(filePath)) await FileUtil.remove(filePath);
      console.error(`[HttpRequest] download_stream 流错误: ${url}`, e);
    });

    response.data.pipe(fileStream);

    return new Promise<string>((resolve, reject) => {
      fileStream.on('finish', () => {
        on_progress?.(100);
        resolve(filePath);
      });
      fileStream.on('error', async (e) => {
        try {
          if (await FileUtil.access(filePath)) await FileUtil.remove(filePath);
        } catch {}
        reject(e);
      });
    });
  }
}
