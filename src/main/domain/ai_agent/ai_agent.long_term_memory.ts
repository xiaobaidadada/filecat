import {DataUtil} from "../data/DataUtil";
import {data_common_key, data_dir_tem_name} from "../data/data_type";
import {ai_agentService} from "./ai_agent.service";
import {llmPost} from "./llm_request";
import {
    ai_agent_chat_session_item,
    ai_long_term_memory_setting,
} from "../../../common/req/filecat.ai.pojo";

/**
 * ============ 长期记忆跨会话持久化 ============
 *
 * 四个独立文件（纯文本，带周期标签行），存储于 ai_agent_chat_session_dir 目录下：
 * - long_term_memory_week.txt    3000 字  周记忆（每次会话压缩后必然更新）
 * - long_term_memory_month.txt   6000 字  月记忆（周切换时，用 AI 压缩旧周+现有月 → 月）
 * - long_term_memory_year.txt    9000 字  年记忆（月切换时，用 AI 压缩旧月+现有年 → 年）
 * - long_term_memory_forever.txt 12000 字 永久记忆（年切换时，用 AI 压缩旧年+现有永久 → 永久）
 *
 * 文件格式：第一行为周期标签（如 "2025-W28" / "2025-07" / "2025"），后续为记忆文本。
 * 永久文件无标签行，纯记忆文本。
 *
 * 级联压缩规则：
 * - syncMemory 每次调用时必然写入周文件
 * - 写入前检测：如果文件记录的周标签 ≠ 当前周 → fire-and-forget 触发周→月 AI 压缩，清空周文件
 * - rollupWeekToMonth 内部也会检测月标签是否已变，是则先级联触发月→年
 * - rollupMonthToYear 同理检测年→永久
 */

export class AiAgentLongTermMemoryService {

    private static readonly LTM_WEEK_FILE = 'long_term_memory_week.txt';
    private static readonly LTM_MONTH_FILE = 'long_term_memory_month.txt';
    private static readonly LTM_YEAR_FILE = 'long_term_memory_year.txt';
    private static readonly LTM_FOREVER_FILE = 'long_term_memory_forever.txt';

    private static readonly MAX_WEEK_CHARS = 3000;
    private static readonly MAX_MONTH_CHARS = 6000;
    private static readonly MAX_YEAR_CHARS = 9000;
    private static readonly MAX_FOREVER_CHARS = 12000;

    // ---- 开关设置 ----

    public get_setting(): ai_long_term_memory_setting {
        return DataUtil.get<ai_long_term_memory_setting>(
            data_common_key.ai_long_term_memory_setting
        ) ?? { open: false };
    }

    public save_setting(setting: ai_long_term_memory_setting) {
        DataUtil.set(data_common_key.ai_long_term_memory_setting, setting);
    }

    // ---- 底层文件读写 ----

    private readFile(filename: string): string {
        return DataUtil.getFile(filename, data_dir_tem_name.ai_agent_chat_session_dir);
    }

    private writeFile(filename: string, content: string) {
        DataUtil.setFile(filename, content, data_dir_tem_name.ai_agent_chat_session_dir);
    }

    // ---- 周期计算 ----

    private currentLabels(now: Date = new Date()) {
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        // ISO week
        const d = new Date(Date.UTC(year, now.getMonth(), now.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

        return {
            week:  `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`,
            month: `${year}-${String(month).padStart(2, '0')}`,
            year:  `${year}`,
        };
    }

    // ====================================================================
    //  公开 API
    // ====================================================================

    /**
     * 每次会话压缩后调用。
     *
     * 必然更新周文件。
     * 如果检测到跨周 → fire-and-forget 触发周→月压缩 + 清空周文件（旧内容已读走）。
     *
     * ⚠️ AI 压缩是异步 fire-and-forget，不阻塞 syncMemory 返回。
     *   下次 syncMemory 时如果 rollup 还没完成，周 label 仍为旧值，会再次触发（幂等）。
     */
    public syncMemory(session: ai_agent_chat_session_item) {
        const setting = this.get_setting();
        if (!setting.open) return;
        if (!session?.long_term_memory) return;

        const labels = this.currentLabels();

        // 读周文件
        const weekRaw = this.readFile(AiAgentLongTermMemoryService.LTM_WEEK_FILE);
        const { label: savedWeekLabel, content: savedWeekContent } = this.parseLabel(weekRaw);

        // 跨周检测
        if (savedWeekLabel && savedWeekLabel !== labels.week && savedWeekContent) {
            // fire-and-forget：旧周内容 → 合并到月文件
            this.rollupWeekToMonth(savedWeekContent, labels.month).catch(e =>
                console.error('[长期记忆] 周→月压缩失败:', e?.message ?? e)
            );
            // 立即清空周文件，下面写新内容
            this.writeFile(AiAgentLongTermMemoryService.LTM_WEEK_FILE, '');
        }

        // 写入周文件：合并本次压缩结果
        const currentWeekContent = (savedWeekLabel === labels.week) ? savedWeekContent : '';
        const merged = this.mergeText(currentWeekContent, session.long_term_memory);
        this.writeFile(
            AiAgentLongTermMemoryService.LTM_WEEK_FILE,
            `${labels.week}\n${merged.slice(0, AiAgentLongTermMemoryService.MAX_WEEK_CHARS)}`
        );
    }

    /** 构建长期记忆上下文，注入给 AI。读取四个文件拼接 */
    public buildContext(): string {
        const setting = this.get_setting();
        if (!setting.open) return '';

        const parts: string[] = [];

        const weekRaw = this.readFile(AiAgentLongTermMemoryService.LTM_WEEK_FILE);
        const { content: wc, label: wl } = this.parseLabel(weekRaw);
        if (wc) parts.push(`[本周记忆 · ${wl ?? '当前周'}]\n${wc}`);

        const monthRaw = this.readFile(AiAgentLongTermMemoryService.LTM_MONTH_FILE);
        const { content: mc, label: ml } = this.parseLabel(monthRaw);
        if (mc) parts.push(`[本月记忆 · ${ml ?? '当前月'}]\n${mc}`);

        const yearRaw = this.readFile(AiAgentLongTermMemoryService.LTM_YEAR_FILE);
        const { content: yc, label: yl } = this.parseLabel(yearRaw);
        if (yc) parts.push(`[本年记忆 · ${yl ?? '当前年'}]\n${yc}`);

        const foreverRaw = this.readFile(AiAgentLongTermMemoryService.LTM_FOREVER_FILE);
        const foreverContent = this.stripLabel(foreverRaw);
        if (foreverContent) parts.push(`[永久记忆]\n${foreverContent}`);

        if (parts.length === 0) return '';
        return `跨会话长期记忆：\n${parts.join('\n\n')}\n请结合这些记忆理解用户的历史偏好和项目约定。`;
    }

    // ---- 前端编辑器 API ----

    public readTypeFile(type: 'week' | 'month' | 'year' | 'forever'): string {
        return this.readFile(this.ltmFileName(type));
    }

    public writeTypeFile(type: 'week' | 'month' | 'year' | 'forever', content: string) {
        this.writeFile(this.ltmFileName(type), content.slice(0, this.ltmMaxChars(type)));
    }

    // ====================================================================
    //  级联压缩（异步，fire-and-forget）
    // ====================================================================

    /**
     * 周→月：将旧周内容与现有月内容用 AI 压缩合并，写入月文件。
     * 如果在此之前月文件的 label 也已过期，先级联月→年。
     */
    private async rollupWeekToMonth(weekContent: string, currentMonthLabel: string) {
        const monthRaw = this.readFile(AiAgentLongTermMemoryService.LTM_MONTH_FILE);
        const { content: monthContent, label: monthLabel } = this.parseLabel(monthRaw);

        // 月文件也跨月了？先级联
        if (monthLabel && monthLabel !== currentMonthLabel && monthContent) {
            await this.rollupMonthToYear(monthContent, this.currentLabels().year);
        }

        const compressed = await this.aiCompress(weekContent, monthContent);
        this.writeFile(
            AiAgentLongTermMemoryService.LTM_MONTH_FILE,
            `${currentMonthLabel}\n${compressed.slice(0, AiAgentLongTermMemoryService.MAX_MONTH_CHARS)}`
        );
    }

    /** 月→年 */
    private async rollupMonthToYear(monthContent: string, currentYearLabel: string) {
        const yearRaw = this.readFile(AiAgentLongTermMemoryService.LTM_YEAR_FILE);
        const { content: yearContent, label: yearLabel } = this.parseLabel(yearRaw);

        if (yearLabel && yearLabel !== currentYearLabel && yearContent) {
            await this.rollupYearToForever(yearContent);
        }

        const compressed = await this.aiCompress(monthContent, yearContent);
        this.writeFile(
            AiAgentLongTermMemoryService.LTM_YEAR_FILE,
            `${currentYearLabel}\n${compressed.slice(0, AiAgentLongTermMemoryService.MAX_YEAR_CHARS)}`
        );
    }

    /** 年→永久 */
    private async rollupYearToForever(yearContent: string) {
        const foreverRaw = this.readFile(AiAgentLongTermMemoryService.LTM_FOREVER_FILE);
        const foreverContent = this.stripLabel(foreverRaw);

        const compressed = await this.aiCompress(yearContent, foreverContent);
        this.writeFile(
            AiAgentLongTermMemoryService.LTM_FOREVER_FILE,
            compressed.slice(0, AiAgentLongTermMemoryService.MAX_FOREVER_CHARS)
        );
    }

    // ====================================================================
    //  AI 调用
    // ====================================================================

    /** 用 AI 将 source + dest 压缩合并为一段精炼文本 */
    private async aiCompress(source: string, dest: string): Promise<string> {
        const cfg = ai_agentService.ai_config;
        if (!cfg) throw new Error('ai config not found');

        const body: any = {
            model: cfg.model,
            messages: [
                {
                    role: 'system',
                    content:
                        '你是长期记忆压缩器。请将提供的"旧周期记忆"和"现有记忆"合并压缩为一段精炼的文本。' +
                        '只保留对未来的对话仍有价值的信息：用户偏好、长期事实、项目约定、重要决定。' +
                        '去除重复信息、临时性内容、已完成的琐碎任务。' +
                        '请只输出压缩后的纯文本（不要 JSON，不要解释）。',
                },
                {
                    role: 'user',
                    content: [
                        dest ? `现有记忆：\n${dest}` : '',
                        `旧周期记忆：\n${source}`,
                    ].filter(Boolean).join('\n\n'),
                },
            ],
            temperature: 0.2,
        };
        try {
            const res = await llmPost(body, cfg);
            const text = await this.readAiResponse(res);
            return text.trim();
        } catch (e) {
            console.error('[长期记忆] AI 压缩调用失败:', e?.message ?? e);
            // 降级：直接拼接
            return this.mergeText(dest, source);
        }
    }

    private async readAiResponse(res: any): Promise<string> {
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok) throw new Error(await res.text());

        if (contentType.includes("text/event-stream") && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let text = "";
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, {stream: true});
                for (const part of chunk.split("\n")) {
                    const line = part.trim();
                    if (!line.startsWith("data:")) continue;
                    const data = line.slice(5).trim();
                    if (!data || data === "[DONE]") continue;
                    try {
                        const json = JSON.parse(data);
                        text += json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
                    } catch {}
                }
            }
            return text;
        }
        const json = await res.json();
        return json.choices?.[0]?.message?.content ?? "";
    }

    // ====================================================================
    //  文本工具
    // ====================================================================

    private mergeText(a: string, b: string): string {
        if (!a) return b;
        if (!b) return a;
        return (a + '\n' + b).trim().replace(/\n{3,}/g, '\n\n');
    }

    /** 解析 "label\ncontent" 格式 */
    private parseLabel(raw: string): { label: string | undefined; content: string } {
        const t = (raw ?? '').trim();
        if (!t) return { label: undefined, content: '' };
        const nl = t.indexOf('\n');
        if (nl <= 0) {
            return /^\d{4}(-W\d{2}|-\d{2})$/.test(t)
                ? { label: t, content: '' }
                : { label: undefined, content: t };
        }
        const first = t.slice(0, nl).trim();
        const rest = t.slice(nl + 1).trim();
        return /^\d{4}(-W\d{2}|-\d{2})$/.test(first)
            ? { label: first, content: rest }
            : { label: undefined, content: t };
    }

    /** 去掉第一行 label，用于永久文件 */
    private stripLabel(raw: string): string {
        const t = (raw ?? '').trim();
        const nl = t.indexOf('\n');
        if (nl <= 0) return t;
        return /^\d{4}(-W\d{2}|-\d{2})$/.test(t.slice(0, nl).trim())
            ? t.slice(nl + 1).trim()
            : t;
    }

    // ---- 文件名/上限映射 ----

    private ltmFileName(type: 'week' | 'month' | 'year' | 'forever'): string {
        switch (type) {
            case 'week':    return AiAgentLongTermMemoryService.LTM_WEEK_FILE;
            case 'month':   return AiAgentLongTermMemoryService.LTM_MONTH_FILE;
            case 'year':    return AiAgentLongTermMemoryService.LTM_YEAR_FILE;
            case 'forever': return AiAgentLongTermMemoryService.LTM_FOREVER_FILE;
        }
    }

    private ltmMaxChars(type: 'week' | 'month' | 'year' | 'forever'): number {
        switch (type) {
            case 'week':    return AiAgentLongTermMemoryService.MAX_WEEK_CHARS;
            case 'month':   return AiAgentLongTermMemoryService.MAX_MONTH_CHARS;
            case 'year':    return AiAgentLongTermMemoryService.MAX_YEAR_CHARS;
            case 'forever': return AiAgentLongTermMemoryService.MAX_FOREVER_CHARS;
        }
    }
}

export const aiAgentLongTermMemoryService = new AiAgentLongTermMemoryService();
