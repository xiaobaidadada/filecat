const sudo = require('@vscode/sudo-prompt');
const { spawn } = require('child_process');
const path = require('path');

// 配置
const options = {
    name: 'filecat' // 可以设置你的应用名称
};

// 需要提升权限执行的命令
const command = 'ts-node';
const args = ['--transpile-only', './src/main/server.ts', '--env', './env'];

// 使用 sudo 提升权限来启动命令
sudo.exec('echo', options, (err, stdout, stderr) => {
    if (err) {
        console.error('Error with sudo:', err);
        return;
    }

    // 通过 spawn 启动命令
    const process = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe']  // 设置输出流
    });

    // 实时输出 stdout
    process.stdout.on('data', (data) => {
        console.log(data.toString().trim());
    });

    // 实时输出 stderr
    process.stderr.on('data', (data) => {
        console.error(data.toString().trim());
    });

    // 监听子进程退出
    process.on('close', (code) => {
        console.log(`子进程退出，退出码: ${code}`);
    });

    // 监听启动错误
    process.on('error', (err) => {
        console.error('启动子进程失败:', err);
    });

    // 监听父进程的退出信号，确保终止子进程
    process.on('exit', () => {
        console.log('父进程退出，子进程也应该退出');
        process.kill();  // 确保杀死子进程
    });

    // 捕获SIGINT（Ctrl+C）信号并终止子进程
    process.on('SIGINT', () => {
        console.log('接收到 SIGINT，正在退出...');
        process.kill();  // 终止子进程
        process.exit(0);  // 父进程也退出
    });
});