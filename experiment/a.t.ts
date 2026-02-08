import FlexSearch, {Charset} from "flexsearch";
import fs from "fs";
import * as path from "path";

// 原理是倒排索引
const index = new FlexSearch.Index({
    // strict：只按“空格/分隔符”切词
    tokenize: "strict", // 一个词，要被拆成多少 可被搜索的索引项
    // resolution: 1 ~ 9
    // 模糊匹配精度，数值越大越“宽松”
    // 9 = 中文/英文混合搜索的常用推荐值
    // resolution: 9,
    // 是否缓存搜索结果
    // false：每次都实时算（数据量不大时 OK）
    // cache: false,
    encoder: Charset.CJK
    // context —— 上下文搜索（词距相关性）让搜索结果更像「自然语言理解」
});

/**
 * 读取 docs 目录下的所有文件
 * 每个文件作为一个“文档”加入索引
 */
const dir = path.join(__dirname, "docs");
const files = fs.readdirSync(dir);
const data_map = new Map<number, {
    path:string
}>();
for(let i = 0; i < files.length; i++) {
    const file = files[i];
    const file_path = path.join(dir, file);
    // 读取文件内容
    const content = fs.readFileSync(file_path, "utf-8");
    data_map.set(i, {
        path: file_path,
    });
    // 向索引中添加文档
    index.add(i, content);
}


/**
 * FlexSearch 搜索参数说明：
 *
 * | 参数      | 作用 |
 * |----------|------|
 * | limit    | 限制返回数量 |
 * | enrich   | 返回完整文档信息（含 store 字段） |
 * | suggest  | 搜索不到时，给出近似匹配 |
 * | field    | 指定搜索字段 |
 */

/**
 * 多关键词搜索
 * 目标：关键词命中越多，文档排名越靠前
 */
const keywords = ["索引"];

// 用于统计每个文档被命中的次数
// key: 文档 id
// value: 命中关键词数量
const scoreMap = new Map<number, number>();
for (const k of keywords) {
    const ids = index.search(k,{
        suggest: true, // 可以不完全匹配也返回 接近匹配就行
        resolution: 9,
        cache: true,
        limit: 5 // 返回5个文件就行
        // offset // 分页
    }) as number[];

    for (const id of ids) {
        scoreMap.set(id, (scoreMap.get(id) || 0) + 1);
    }
}

const sorted = [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1]) // 从大到小排序 按得分排序
    .map(([id]) => id); // 只保留 key也就是id

console.log(sorted);

/**
 * Retrieval-Augmented Generation方案：
 * 1. 提供一个tools函数给ai，提示词是 该函数提供本地知识库搜索，当你不知道某些信息的时候，可以用该函数来查询，函数的参数是个数组，数组的参数是一系列需要被检索查询的 关键词。
 * 让ai来提供需要被查询的关键词查询
 * 2. 让用户提供目录来提供需要被索引的文件，怎么触发文件的索引，还需要在想一想，手动，还是检测文件有没有发生变化自动加载，还是用户点击的时候查询让用户自己执行加载
 * 3. 内存占用情况，查询速度考虑
 * 4. 虽然是本地文件，但是只是本地数据库，又不是大型数据库，索引小型本地公司知识库，全部加载到内存是没有问题的，几十万个字符数量以内内存中做这个事完全没有问题，非常方便，速度也能保证
 */