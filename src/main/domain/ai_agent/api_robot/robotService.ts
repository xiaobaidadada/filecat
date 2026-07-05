import { ai_rebot_item } from "../../../../common/req/filecat.ai.pojo";
import { settingService } from "../../setting/setting.service";
import { QQBotConnection } from "./qqBot";
import { DingTalkBotConnection } from "./dingtalkBot";
import { WeComBotConnection } from "./wecomBot";
import { LarkBotConnection } from "./larkBot";

/** 统一的连接类型 */
export type BotConnection = QQBotConnection | DingTalkBotConnection | WeComBotConnection | LarkBotConnection;

function isSameConfig(a: ai_rebot_item, b: ai_rebot_item): boolean {
    return (
        a.appId === b.appId &&
        a.clientSecret === b.clientSecret &&
        a.platform === b.platform &&
        a.model_index === b.model_index &&
        a.user_id === b.user_id
    );
}

class RobotService {
    private connections: BotConnection[] = []

    /** 重新加载所有机器人配置。先全部关闭，再判断哪些需要开启。 */
    async reload(): Promise<void> {
        // 1. 先全部关闭
        for (const conn of this.connections) {
            conn.stop();
        }
        this.connections = []
        const list = settingService.ai_rebot_setting().list || [];
        // 3. 启动新增或配置变更的机器人
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (!item.open) continue;

            console.log('[Rebot] 启动机器人:', item.name || i, '平台:', item.platform);
            let conn: BotConnection;
            if (item.platform === 'dingtalk') {
                conn = new DingTalkBotConnection({ ...item });
            } else if (item.platform === 'wecom') {
                conn = new WeComBotConnection({ ...item });
            } else if (item.platform === 'lark') {
                conn = new LarkBotConnection({ ...item });
            } else {
                conn = new QQBotConnection({ ...item });
            }
            this.connections.push(conn);
            conn.start().catch(err => {
                console.error(`[Rebot] ${item.platform} 机器人启动失败:`, err);
            });
        }
    }

    getStatus(): ai_rebot_item[] {
        const list = settingService.ai_rebot_setting().list || [];
        return list.map(item => ({ ...item }));
    }

    stopAll(): void {
        for (const conn of this.connections) {
            conn.stop();
        }
        this.connections = []
    }
}

export const robotService = new RobotService();
