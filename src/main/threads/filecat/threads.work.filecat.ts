import {file_search_start} from "../../domain/file/search/file.search.worker";
import {start_ai_agent_agent} from "../../domain/ai_agent/ai_agent.worker";
import {start_sys_worker} from "../../domain/sys/sys.worker";


// 子线程 - 文件搜索功能
file_search_start()

// 嵌入式全文检索功能 不能使用两个线程
start_ai_agent_agent()

// 获取子内存占用情况
start_sys_worker()