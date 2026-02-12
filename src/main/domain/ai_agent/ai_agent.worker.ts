import {register_threads_worker_handler} from "../../threads/threads.work";
import {threads_msg_type} from "../../threads/threads.type";
import FlexSearch, {Charset, Index} from "flexsearch";
import {data_dir_tem_name, file_key} from "../data/data_type";
import Database from "flexsearch/db/sqlite";
import {get_bin_dependency} from "../bin/get_bin_dependency";

const {
    cut,
    cut_all,
    cut_for_search,
    tokenize,
    add_word,
} = require("jieba-wasm");
const sqlite3 = get_bin_dependency("sqlite3")


let doc_index: Index
let doc_names_index: Index
let index_storage_type_: 'sqlite' | 'memory'

export function start_ai_agent_agent() {
    register_threads_worker_handler(threads_msg_type.docs_init, async (data) => {
        const {index_storage_type ,a,b} = data.data
        index_storage_type_ = index_storage_type;
        if (!doc_index) {
            doc_index = new FlexSearch.Index({
                tokenize: "strict",
                // encoder: Charset.CJK
            });
            doc_names_index = new FlexSearch.Index({
                tokenize: "strict",
                // encoder: Charset.CJK
            });
            if (index_storage_type === 'sqlite' && sqlite3.Database) {
                const _index_db = new Database({
                    db: new sqlite3.Database(a)
                });
                const name_index_db = new Database({
                    db: new sqlite3.Database(b)
                });
                await doc_index.mount(_index_db)
                await doc_names_index.mount(name_index_db)
            }
        }

    })

    register_threads_worker_handler(threads_msg_type.docs_add, async (data) => {
        let {use_zh_segmentation, content, file_path} = data.data
        if (use_zh_segmentation) {
            content = cut(content, true).join(" ").toLowerCase()
            const p = cut(file_path, true).join(" ").toLowerCase()
            doc_names_index.add(file_path, p)
        } else {
            doc_names_index.add(file_path, file_path.toLowerCase())
        }
        doc_index.add(file_path, content);
        if (index_storage_type_ === 'sqlite' && sqlite3.Database) {
            await doc_index.commit()
            await doc_names_index.commit()
        }
    })


    register_threads_worker_handler(threads_msg_type.docs_del, async (data) => {
        let {file_path} = data.data
        doc_index.remove(file_path)
        doc_names_index.remove(file_path)
        if (index_storage_type_ === 'sqlite' && sqlite3.Database) {
            await doc_index.commit()
            await doc_names_index.commit()
        }
    })

    register_threads_worker_handler(threads_msg_type.docs_close, async (data) => {
        doc_index.clear()
        doc_names_index.clear()
        if (index_storage_type_ === 'sqlite' && sqlite3.Database) {
            await doc_index.commit()
            await doc_names_index.commit()
        }
        doc_index = null;
        doc_names_index = null
    })

    register_threads_worker_handler(threads_msg_type.docs_search, async (data) => {
            const {key} = data.data
            const query_body = {
                suggest: true, // 可以不完全匹配也返回 接近匹配就行 删除搜索变的严格
                resolution: 9, // 7 - 9 评分
                context: true,
                limit: 50
                // cache: true, // 重复查询概率低 没有必要
                // limit: config_search_doc.docs_max_num
                // offset // 分页
            }
            const ids = doc_index.search(key,query_body) as string[];
            const names_ids = doc_names_index.search(key,query_body) as string[];
            if (index_storage_type_ === 'sqlite' && sqlite3.Database) {
                return {
                    ids: await ids,
                    names_ids: await names_ids
                }
            }
            return {ids, names_ids}
    })

}