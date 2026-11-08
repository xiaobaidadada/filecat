/**
 * 需要用户确认才能继续时的中断信号。
 *
 * 抛出后本轮立即结束：上层把 ask_user 消息写进会话并标记 _interrupted。
 * 用户下次确认时，动作作为新一轮重新发起 —— 完全不依赖内存状态，
 * 所以重启、刷新之后依然可以继续确认。
 */
import type {ai_agent_message_item} from "../../../common/req/filecat.ai.pojo";

/**
 * 需要用户确认才能继续时的中断信号。
 *
 * 抛出后本轮立即结束：上层把「已发出但尚未有结果的工具调用」原样落盘。
 * 用户确认后重新发起一轮，模型上下文里那条 tool_call 仍然缺少结果，
 * 于是本轮会自动补上真正的执行结果 —— 对模型来说，这次确认从未发生过。
 */
export class AskUserPending extends Error {
    constructor(
        /** 要插入到消息流里的确认卡片（ask_user 消息） */
        public ask_msg: ai_agent_message_item,
        /**
         * 等待用户确认的工具调用 id 列表。
         * 确认后这些工具会真正执行，用户拒绝则直接返回拒绝结果。
         */
        public pending_tool_call_ids: string[] = [],
    ) {
        super("ask_user_pending");
        this.name = "AskUserPending";
    }
}
