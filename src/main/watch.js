const { fork } = require('child_process');
const readline = require('readline');
const path = require('path');

let child = null;

// 判断是否包含 dev
const argv = process.argv;
const isDev = argv.includes('dev');

// 子进程入口
const childScript = path.resolve(__dirname, isDev ? 'server.ts' : 'main.js');
const childArgs = argv.slice(2); // 传递给子进程的参数

let last = 0
let running = false;
function startServer() {
    if(running === true && Date.now() - last <= 3000) {
        // 最少3秒重启一次
        console.log(`${last} server started`);
        return;
    }
    last = Date.now();
    running = true;
    console.log('🚀 启动子进程...', (new Date()).toLocaleString());

    if (isDev) {
        // dev 模式下 fork ts 文件，使用 ts-node/register
        child = fork(childScript, [...childArgs,'--watch'], {
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'], // 输出 + 消息通道
            execArgv: ['-r', 'ts-node/register'],
            env: { ...process.env }
        });
    } else {
        // 生产模式 fork js 文件
        child = fork(childScript, childArgs, {
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            env: { ...process.env }
        });
    }

    // 监听子进程发来的消息
    child.on('message', (msg) => {
        if (msg === 'restart') {
            console.log('♻️ 子进程请求重启...');
            restartServer();
        }
    });

    // 子进程退出事件
    child.on('exit', (code, signal) => {
        console.log(`⚠️ 子进程退出：code=${code}, signal=${signal}`);
    });
}

function restartServer() {
    running = false;
    if (child) {
        console.log('♻️ 正在重启子进程...');
        child.kill('SIGTERM'); // 发送信号让子进程优雅退出
        setTimeout(() => startServer(), 500); // 延迟重启，给端口释放时间
    } else {
        startServer();
    }
}

// 启动子进程
startServer();

// 监听键盘输入
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
    // Ctrl + R 重启
    if (key.ctrl && key.name === 'r') {
        restartServer();
    }

    // Ctrl + C 退出
    if (key.ctrl && key.name === 'c') {
        console.log('\n🛑 主进程退出');
        if (child) child.kill('SIGTERM');
        process.exit(0);
    }
});
