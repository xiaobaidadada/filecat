import 'reflect-metadata';
import {startLauncher} from "./watch";

if (process.argv.includes('--child')) {
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
