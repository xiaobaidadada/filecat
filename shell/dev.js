
const { spawn } = require('child_process');
const path = require("path");
const Webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const webpackConfig = require('./config/webpack.config.js');
const {findAvailablePort} = require("../src/common/findPort");

// const temLog = console.log;

// const child = spawn('npm', ['run', 'server-dev'], {
//     shell: true, // 在某些系统上可能需要设置 shell 为 true 以正确执行命令
//     stdio: 'inherit', // 使子进程的输入、输出和错误流与父进程共享
// });

// child.stdout.on('data', (data) => {
//
//     console.log(data.toString());
// })
// child.stderr.on('data', (data) => {
//     console.log = temLog;
//     console.error(data.toString());
// });


const runServer = async () => {
    const port = await findAvailablePort(49152, 65535);
    process.env.webpack_port = port;
    webpackConfig['mode'] = 'development';
    webpackConfig['devServer']['port'] = port;
    webpackConfig['devServer']['onListening'] = function (devServer) {
        if (!devServer) {
            throw new Error('webpack-dev-server is not defined');
        }
        console.log('\x1b[Please use the backend port to access the web page\x1b[0m');
    };
    const compiler = Webpack(webpackConfig);

// webpackConfig['mode'] = 'production';
    const devServerOptions = { ...webpackConfig.devServer, open: false };
    const server = new WebpackDevServer(devServerOptions, compiler);
    server.start();
    require("../src/main/server")
};

runServer();
// console.log = function (...args) {
// }



