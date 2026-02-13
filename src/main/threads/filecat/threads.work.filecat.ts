import {file_search_start} from "../../domain/file/search/file.search.worker";
import {start_ai_agent_agent} from "../../domain/ai_agent/ai_agent.worker";


// 子线程 - 文件搜索功能
file_search_start()

// 嵌入式全文检索功能 不能使用两个线程
start_ai_agent_agent()

