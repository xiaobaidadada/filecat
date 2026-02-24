import { register_threads_worker_handler } from "../../threads/threads.work";
import { threads_msg_type } from "../../threads/threads.type";
import FlexSearch, { Index } from "flexsearch";
import Database from "better-sqlite3";
import { cut } from "jieba-wasm";
import {get_bin_dependency} from "../bin/get_bin_dependency";
import {FileUtil} from "../file/FileUtil";
const sqlite3 = get_bin_dependency("sqlite3")

let doc_index: Index | null = null;
let doc_names_index: Index | null = null;

let sqlite_db: Database.Database | null = null;
let insert_doc_stmt: any;
let insert_name_stmt: any;
let delete_doc_stmt: any;
let delete_name_stmt: any;
let search_doc_stmt: any;
let search_name_stmt: any;
let select_doc_mtime_stmt: any;
let select_name_mtime_stmt: any;


let index_storage_type_: "sqlite" | "memory" = "memory";

export function start_ai_agent_agent() {

    /* ---------------------------- 初始化 ---------------------------- */

    register_threads_worker_handler(threads_msg_type.docs_init, async (data) => {
        const { index_storage_type, db_path } = data.data;
        index_storage_type_ = index_storage_type;

        /* ------------------ Memory 模式 ------------------ */
        if (index_storage_type === "memory") {
            if (!doc_index) {
                doc_index = new FlexSearch.Index({ tokenize: "strict" });
                doc_names_index = new FlexSearch.Index({ tokenize: "strict" });
            }
        }

        /* ------------------ SQLite FTS5 模式 ------------------ */
        if (index_storage_type === "sqlite") {

            sqlite_db = new Database(db_path,{
                nativeBinding:sqlite3
            });

            // sqlite_db.exec(`
            //     PRAGMA journal_mode = WAL;
            //     PRAGMA synchronous = NORMAL;
            //     PRAGMA temp_store = MEMORY;
            //     PRAGMA mmap_size = 30000000000;
            // `);
            // sqlite_db.exec(`
            //     PRAGMA journal_mode = WAL;
            //     PRAGMA synchronous = NORMAL;
            //     -- 限制 SQLite 内存缓存
            //     PRAGMA cache_size = -10000;   -- 约 10MB
            //     -- 临时数据不要放内存
            //     PRAGMA temp_store = FILE;
            //     -- 太大容易吃内存
            //     PRAGMA mmap_size = 67108864; --64MB
            //     -- 提交页的数量
            //     PRAGMA wal_autocheckpoint = 20;
            // `);


            // 创建 FTS5 表，使用 unicode61 支持空格分词
            sqlite_db.exec(`
                    CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
                        file_path UNINDEXED,
                        content,
                        mtime UNINDEXED,
                        tokenize = 'unicode61'
                    );
                
                    CREATE VIRTUAL TABLE IF NOT EXISTS doc_names USING fts5(
                        file_path UNINDEXED,
                        name,
                        mtime UNINDEXED,
                        tokenize = 'unicode61'
                    );
            `);

            select_doc_mtime_stmt = sqlite_db.prepare(`
                SELECT mtime FROM docs WHERE file_path = ? LIMIT 1
            `);

            select_name_mtime_stmt = sqlite_db.prepare(`
                SELECT mtime FROM doc_names WHERE file_path = ? LIMIT 1
            `);


            insert_doc_stmt = sqlite_db.prepare(
                `INSERT INTO docs (file_path, content, mtime) VALUES (?, ?, ?)`
            );

            insert_name_stmt = sqlite_db.prepare(
                `INSERT INTO doc_names (file_path, name, mtime) VALUES (?, ?, ?)`
            );


            delete_doc_stmt = sqlite_db.prepare(
                `DELETE FROM docs WHERE file_path = ?`
            );

            delete_name_stmt = sqlite_db.prepare(
                `DELETE FROM doc_names WHERE file_path = ?`
            );

            search_doc_stmt = sqlite_db.prepare(`
                SELECT file_path
                FROM docs
                WHERE docs MATCH ?
                ORDER BY bm25(docs)
                    LIMIT 50
            `);

            search_name_stmt = sqlite_db.prepare(`
                SELECT file_path
                FROM doc_names
                WHERE doc_names MATCH ?
                ORDER BY bm25(doc_names)
                    LIMIT 50
            `);
        }
    });

    /* ---------------------------- 添加文档 ---------------------------- */

    register_threads_worker_handler(threads_msg_type.docs_add, async (data) => {
        let { use_zh_segmentation, file_path ,mtime} = data.data;

        // const stat = await FileUtil.statSync(file_path); // 需要你封装或用 fs.statSync

        let content:string;
        let char_num:number;
        if (index_storage_type_ === "sqlite" && sqlite_db) {
            mtime = mtime ?? (await FileUtil.statSync(file_path)).mtime;
            // 1. 检查 docs 表
            const oldDoc = select_doc_mtime_stmt.get(file_path);
            if (oldDoc && oldDoc.mtime === mtime) {
                return { char_num:0 }; // 未变化，直接跳过
            }

            content = `${file_path} ${(await FileUtil.readFileSync(file_path)).toString()}。`
            char_num = content.length;
            let c = content;
            let name = file_path;

            if (use_zh_segmentation) {
                c = cut(content, true).join(" ");
                name = cut(file_path, true).join(" ");
            }

            // 2. 删除旧记录（如果存在）
            delete_doc_stmt.run(file_path);
            delete_name_stmt.run(file_path);

            // 3. 插入新记录
            insert_doc_stmt.run(file_path, c, mtime);
            insert_name_stmt.run(file_path, name, mtime);
        }

        /* memory 模式保持不变 */
        if (index_storage_type_ === "memory") {
            content = `${file_path} ${(await FileUtil.readFileSync(file_path)).toString()}。`
            char_num = content.length;
            let c = content.toLowerCase();
            let name = file_path.toLowerCase();

            if (use_zh_segmentation) {
                c = cut(content, true).join(" ").toLowerCase();
                name = cut(file_path, true).join(" ").toLowerCase();
            }

            doc_index?.add(file_path, c);
            doc_names_index?.add(file_path, name);
        }

        return { char_num };
    });


    /* ---------------------------- 删除文档 ---------------------------- */

    register_threads_worker_handler(threads_msg_type.docs_del, async (data) => {
        const { file_path } = data.data;

        if (index_storage_type_ === "memory") {
            doc_index?.remove(file_path);
            doc_names_index?.remove(file_path);
        }

        if (index_storage_type_ === "sqlite" && sqlite_db) {
            // const transaction = sqlite_db.transaction(() => {
                delete_doc_stmt.run(file_path);
                delete_name_stmt.run(file_path);
            // });
            //
            // transaction();
        }
    });

    /* ---------------------------- 搜索 ---------------------------- */

    register_threads_worker_handler(threads_msg_type.docs_search, async (data) => {
        const { key, use_zh_segmentation } = data.data;

        let query = key;

        if (use_zh_segmentation) {
            const tokens = cut(key, true);
            // 前缀匹配，每个词加 *
            query = tokens.map(t => t + '*').join(' OR ');
        }

        if (index_storage_type_ === "memory") {
            const query_body = { suggest: true, resolution: 9, context: true, limit: 50 };
            return {
                ids: doc_index?.search(query, query_body) || [],
                names_ids: doc_names_index?.search(query, query_body) || []
            };
        }

        if (index_storage_type_ === "sqlite" && sqlite_db) {
            let tokens = cut(query, true).filter(t => t.trim() !== ''); // 过滤空 token
            const queryStr = tokens.map(t => t + '*').join(' OR ');
            const ids = search_doc_stmt.all(queryStr);
            const names_ids = search_name_stmt.all(queryStr);
            return {
                ids: ids.map((r: any) => r.file_path),
                names_ids: names_ids.map((r: any) => r.file_path)
            };
        }

        return { ids: [], names_ids: [] };
    });

    /* ---------------------------- 关闭 ---------------------------- */

    register_threads_worker_handler(threads_msg_type.docs_close, async () => {

        if (index_storage_type_ === "memory") {
            doc_index?.clear();
            doc_names_index?.clear();
            doc_index = null;
            doc_names_index = null;
        }

        if (index_storage_type_ === "sqlite" && sqlite_db) {
            sqlite_db.close();
            sqlite_db = null;
        }
    });
}
