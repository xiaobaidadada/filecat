


export function get_bin_dependency(module:
                                       "@xiaobaidadada/dockerode"
                                       | "@xiaobaidadada/node-pty-prebuilt"
                                       | "@xiaobaidadada/node-tuntap2-wintun"
                                       | "@xiaobaidadada/ssh2-prebuilt"
                                       | "node-process-watcher"
                                       | "sqlite3",
                                   auto_throw = false
) {
    try {
        if (process.env.run_env === 'exe') {
            //  防止 TDZ 错误 同时又可以 让 webpack打包 具体要不要忽略-在webpack中手动控制
            switch (module) {
                case "@xiaobaidadada/dockerode":
                    return require("@xiaobaidadada/dockerode");
                case "@xiaobaidadada/node-pty-prebuilt":
                    return require("@xiaobaidadada/node-pty-prebuilt");
                case "@xiaobaidadada/ssh2-prebuilt":
                    return require("@xiaobaidadada/ssh2-prebuilt");
                case "node-process-watcher":
                    return require("node-process-watcher");
                case "@xiaobaidadada/node-tuntap2-wintun":
                    return require("@xiaobaidadada/node-tuntap2-wintun")
                case "sqlite3":
                    // require("sqlite3/build/Release/node_sqlite3.node") // 只是让他打包的时候把这个二进制包含进去 但是sqlite3用的bings加载 这样也不行
                    return require("./sqlite3/sqlite3");
                default:
                    throw {message: "不存在的包"}
            }
        }

        // webpack打包后会修改原本的 reuqire 加载函数
        return eval("require")(module);
    } catch (e) {
        // 当前平台没有这个能力
        console.log(`${process.env.run_env} 模块没有加载失败，请手动安装 npm 依赖( -g 安装的就尝试全局安装，本地仓库安装的就在仓库内安装)：${module} error ${e.message}`)
        // console.log(e)
        if (auto_throw) throw e;
    }
    return {};
}