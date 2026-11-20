/**
 * Studio 编辑器的浏览状态缓存（滚动位置、光标、画布缩放/平移等）。
 *
 * 切换文件时编辑器会用 key={edit_file_path} 强制重建，视图状态必然丢失，
 * 这里按「文件路径 + 编辑器类型」把状态存到 localStorage，重建后再还原。
 *
 * 只存浏览状态，不存文档内容。
 */

const STORAGE_KEY = 'filecat_studio_view_state';

/** 编辑器类型，用于隔离同路径下不同编辑器的状态 */
export type ViewStateKind = 'ace' | 'draw' | 'mind' | 'timeline' | 'md' | 'excel';

/** 通用视图状态，各编辑器只填自己关心的字段 */
export type ViewState = {
    /** 滚动位置：Ace 的行列、MD 的 scrollTop、Excel 的滚动偏移等 */
    scroll?: number;
    row?: number;
    column?: number;
    /** 画布类编辑器的缩放与平移 */
    zoom?: number;
    scroll_x?: number;
    scroll_y?: number;
    /** 表格类编辑器的当前 sheet 下标 */
    sheet?: number;
};

type StateMap = Record<string, ViewState>;

/** key = `${kind}::${path}`，避免同一路径不同类型编辑器互相覆盖 */
function make_key(kind: ViewStateKind, path: string): string {
    return `${kind}::${path}`;
}

function read_all(): StateMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as StateMap : {};
    } catch (e) {
        return {};
    }
}

function write_all(map: StateMap): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
        // localStorage 满或被禁用时静默失败，浏览状态丢失不影响编辑
    }
}

/** 读取某个文件的浏览状态 */
export function get_view_state(kind: ViewStateKind, path: string): ViewState | undefined {
    if (!path) {
        return undefined;
    }
    return read_all()[make_key(kind, path)];
}

/** 写入某个文件的浏览状态 */
export function set_view_state(kind: ViewStateKind, path: string, state: ViewState): void {
    if (!path) {
        return;
    }
    const map = read_all();
    map[make_key(kind, path)] = state;
    write_all(map);
}

/** 清掉某个文件的浏览状态（文件被删除等场景可用） */
export function clear_view_state(kind: ViewStateKind, path: string): void {
    const map = read_all();
    const key = make_key(kind, path);
    if (key in map) {
        delete map[key];
        write_all(map);
    }
}

/** 清空所有浏览状态（Studio 退出时调用） */
export function clear_all_view_state(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        // 忽略
    }
}
