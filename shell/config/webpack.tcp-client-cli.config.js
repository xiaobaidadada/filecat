/**
 * 内网穿透客户端命令行工具（tcp client CLI）专用 webpack 配置。
 *
 * 入口是 tsc 编译后的产物（与 webpack.npm.config.js 的做法一致，项目没有 ts-loader）：
 *   1. npx tsc                                   -> build/server/main/domain/net/tool_cmd_export/main.js
 *   2. npx webpack --config shell/config/webpack.tcp-client-cli.config.js
 *   3. 产物：build/cli/filecat-tcp-client.js
 *
 * 可直接用 node 运行，也可配合 pkg 打成单文件可执行程序。
 */
const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const {common_plugins, pkg_externals} = require("./base.webpack.config");

const root = path.resolve(__dirname, "..", "..");

module.exports = {
    target: 'node',
    mode: 'production',
    entry: path.join(root, "build", "server", "main", "domain", "net", "tool_cmd_export", "main.js"),
    output: {
        path: path.join(root, "build", "cli"),
        filename: 'filecat-tcp-client.js',
        // 让 require.main === module 在打包后依然可用
        libraryTarget: 'commonjs2',
    },
    resolve: {
        extensions: ['.js', '.node']
    },
    // 只用 node 内置模块，第三方包一律不打包
    externalsPresets: {node: true},
    externals: pkg_externals,
    plugins: [
        new webpack.DefinePlugin(common_plugins),
    ],
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
    },
    // 保留 __dirname 语义，运行时的路径解析交给使用者
    node: {
        __dirname: false,
        __filename: false,
    },
};
