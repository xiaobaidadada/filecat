import path from "path";
import {DataUtil} from "../data/DataUtil";
import {data_dir_tem_name} from "../data/data_type";
import {FileUtil} from "../file/FileUtil";
import {MD_THEME_BUILTIN_CSS} from "./md_theme_builtin";
import {md_theme_item} from "../../../common/req/common.pojo";
import {CheckUtil} from "../../../common/CheckUtil";
import {Env} from "../../../common/node/Env";

/**
 * md 编辑器主题的存取。
 *
 * 主题就是一个 css 文件，放在 md_theme_dir/ 下，文件名（去掉 .css）就是主题名，也是主题 id。
 * 没有索引文件，主题列表直接由目录里的文件推导出来。
 * 列表缓存在内存里，启动时读一次，每次增删改后再读一次。
 *
 * 内置主题只是首次启动（主题目录还不存在）时铺一批进去，之后和用户自己建的主题一样，
 * 都可以改名、都可以删；删光了也不会再自动补。
 */

// 主题文件后缀
const CSS_EXT = ".css";

// 主题名一律走这个校验：空串非法、无非法字符、不是 . / ..、长度受限。
// 校验规则本体在 common 的 CheckUtil，前后端共用；这里只是把「非法」转成抛异常给调用方提示。
export function check_theme_name(name: string): string {
    const theme_name = CheckUtil.filename(name, false);
    if (theme_name === null) {
        throw "主题名称不合法";
    }
    return theme_name;
}

class MdThemeService {
    private dir = data_dir_tem_name.md_theme_dir;
    // 主题列表缓存，顺序即列表顺序
    private cache: md_theme_item[] = [];

    private get abs_dir() {
        return DataUtil.get_dir_path(this.dir);
    }

    // 不建目录的纯路径：判断/铺主题时必须用它，
    // 因为 DataUtil.get_dir_path 会 ensureDirSync，一旦调用目录就已经存在了，
    // 「目录不存在才铺内置主题」的判断会永远不成立。
    private get plain_dir() {
        return path.join(Env.work_dir, this.dir);
    }

    private css_path(id: string) {
        return path.join(this.abs_dir, id + CSS_EXT);
    }

    // 扫描主题目录，重建列表缓存
    private async reload(): Promise<md_theme_item[]> {
        const list: md_theme_item[] = [];
        // 目录可能还没建（init 之前被调用），此时视为没有主题，不建目录
        if (await FileUtil.access(this.plain_dir)) {
            for (const name of await FileUtil.readdirSync(this.plain_dir)) {
                if (!name.endsWith(CSS_EXT)) {
                    continue;
                }
                list.push({id: name.slice(0, -CSS_EXT.length)});
            }
        }
        list.sort((a, b) => a.id.localeCompare(b.id));
        this.cache = list;
        return list;
    }

    // 首次启动时铺内置主题：只在主题目录还不存在的时候做一次
    public async init() {
        if (await FileUtil.access(this.plain_dir)) {
            await this.reload();
            return;
        }
        await FileUtil.ensure_dir(this.abs_dir);
        for (const [name, css] of Object.entries(MD_THEME_BUILTIN_CSS)) {
            await FileUtil.writeFileSync(this.css_path(name), css);
        }
        await this.reload();
    }

    // 主题列表
    public list(): md_theme_item[] {
        return this.cache;
    }

    // 单个主题的 css 正文，主题不存在时返回 null
    public async get_css(id: string): Promise<string | null> {
        if (!this.cache.some(i => i.id === id)) {
            return null;
        }
        return (await FileUtil.readFileSync(this.css_path(id))).toString("utf8");
    }

    /**
     * 当前用户实际该用的主题 css。
     * 用户个人选中（user_data.md_editor_theme）优先，没选过才跟随系统设置里的默认主题。
     * 名字不交代也不传到前端：前端只要最终内容。
     * 没有可用主题时返回空串，前端据此不注入样式。
     */
    public async get_active_css(user_theme: string, sys_theme: string): Promise<string> {
        const id = user_theme || sys_theme;
        if (!id) {
            return "";
        }
        return (await this.get_css(id)) ?? "";
    }

    /**
     * 新建或更新主题。
     * - 传 id 且该 id 存在 => 更新（含改名：id 变了就按新名字落盘，旧文件删掉）
     * - 不传 id => 新建
     */
    public async save(name: string, css: string, id?: string): Promise<md_theme_item> {
        const theme_name = check_theme_name(name);
        if (typeof css !== "string") {
            throw "主题内容不合法";
        }
        if (id) {
            if (!this.cache.some(i => i.id === id)) {
                throw "主题不存在";
            }
            if (theme_name !== id) {
                if (this.cache.some(i => i.id === theme_name)) {
                    throw "主题名称已存在";
                }
                // 改名等于换文件，旧 css 删掉
                await FileUtil.unlinkSync(this.css_path(id));
            }
        } else if (this.cache.some(i => i.id === theme_name)) {
            throw "主题名称已存在";
        }
        await FileUtil.writeFileSync(this.css_path(theme_name), css);
        await this.reload();
        return {id: theme_name};
    }

    // 删除主题
    public async del(id: string) {
        if (!this.cache.some(i => i.id === id)) {
            throw "主题不存在";
        }
        await FileUtil.unlinkSync(this.css_path(id));
        await this.reload();
    }
}

export const mdThemeService = new MdThemeService();
