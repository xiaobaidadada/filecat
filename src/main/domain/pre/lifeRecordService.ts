/**
 * 配置项：生命周期时长（5分钟）
 */
const MAX_LIFE_LEN = 1000 * 60 * 5;
const CLEANUP_INTERVAL = 1000 * 3;

/**
 * 生命周期管理服务
 * 用于自动清理过期资源（如 SSH 连接、WebSocket 会话等）
 */
export class LifecycleRecordService {
    // 数据map
    private dataMap: Map<string, any> = new Map();
    // 心跳map
    private heatMap: Map<string, number> = new Map();
    // 结束事件
    private endMap: Map<string, (data: any) => Promise<void>> = new Map();
    // 一直不过期
    private forEveryMap: Set<string> = new Set<string>();
    private timer: NodeJS.Timeout | null = null;

    /**
     * 注册/更新生命周期
     * @param id 唯一标识符
     * @param data 需要关联的数据
     * @param endHandler 断开连接时触发的回调
     */
    lifeStart(id: string, data?: any, endHandler?: (data: any) => Promise<void>) {
        if (data) this.dataMap.set(id, data);
        if (endHandler) this.endMap.set(id, endHandler);

        this.heatMap.set(id, Date.now());
        this.startTimer();
    }

    /**
     * 内部启动清理定时器
     * 使用单例模式防止重复启动多个定时器
     */
    private startTimer() {
        if (this.timer) return;

        this.timer = setInterval(async () => {
            const now = Date.now();
            // 在循环前先备份 key，防止迭代时 Map 被修改导致的问题
            const keys = Array.from(this.heatMap.keys());

            for (const key of keys) {
                const lastHeartbeat = this.heatMap.get(key) || 0;
                // 检查是否过期（排除一直活跃的项）
                if (!this.forEveryMap.has(key) && (now - lastHeartbeat > MAX_LIFE_LEN)) {
                    await this.lifeClose(key);
                }
            }

            // 如果没有活跃对象，清理定时器以节省 CPU
            if (this.heatMap.size === 0) {
                this.stopTimer();
            }
        }, CLEANUP_INTERVAL);
    }

    private stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** 获取生命周期内存储的数据 */
    lifeGetData(key: string): any {
        return this.dataMap.get(key);
    }

    /** 更新活跃时间 */
    lifeHeart(key: string) {
        if (this.heatMap.has(key)) {
            this.heatMap.set(key, Date.now());
        }
    }

    /** 设置为永不过期 */
    forEveryLifeHeart(key: string) {
        this.forEveryMap.add(key);
    }

    /** 恢复过期判定 */
    endForEveryLifeHeart(key: string) {
        this.forEveryMap.delete(key);
    }

    /**
     * 主动触发清理
     * 执行 cleanup 函数并清理所有相关 Map
     */
    async lifeClose(key: string) {
        const endHandler = this.endMap.get(key);
        if (endHandler) {
            try {
                await endHandler(this.dataMap.get(key));
            } catch (err) {
                console.error(`生命周期清理回调失败 [${key}]:`, err);
            }
        }

        this.heatMap.delete(key);
        this.endMap.delete(key);
        this.dataMap.delete(key);
        this.forEveryMap.delete(key); // 同时清理永不过期列表
    }

}