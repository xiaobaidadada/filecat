import 'reflect-metadata';
import {startLauncher} from "./watch";

// --install / --uninstall / --stop / --restart / --version / --update / --help
// 这些是一次性命令，不需要走守护进程，直接在主进程处理
const oneShotFlags = ['--install', '--uninstall', '--stop', '--restart', '--version', '--update', '--help'];
const isOneShot = oneShotFlags.some(flag => process.argv.includes(flag));

if (isOneShot) {
    // 一次性命令：直接启动 main，不走守护进程
    const { start_main } = require("./main");
    start_main();
} else if (process.argv.includes('--child')) {
    const { start_main } = require("./main");
    // 👉 子进程：启动服务
    start_main();
} else {
    // 👉 主进程：做守护
    startLauncher();
}

const log = console.log.bind(console);
console.log = (...args) => {
    log((new Date()).toLocaleString(),...args);
}
console.info = (...args) => {
    log((new Date()).toLocaleString(),...args);
}
console.error = (...args) => {
    log((new Date()).toLocaleString(),'error',...args);
}
