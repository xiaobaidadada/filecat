const path = require('path');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const package_data = require("../../package.json")
const {base_url} = require("./env");
const { _node_rules, get_exe_plugins, pkg_externals} = require("./base.webpack.config");

module.exports = {
    target: 'node', // 指定打包结果运行在node环境下
    mode: 'production', // 或者 'production'
    entry: path.join(__dirname, "..", "..", "build", "server", "main", "server.js"), // 你的TypeScript入口文件路径
    output: {
        path: path.resolve(__dirname, "..", "..", "build"), // 输出目录
        filename: 'main.js', // 输出文件名
    },
    resolve: {
        extensions: ['.ts', '.js', '.node'], // 解析文件时自动补全的文件扩展名
    },
    module: {
        rules: _node_rules
    },
    externalsPresets: { node: true },
    externals: pkg_externals,
    // externals: [nodeExternals()], // 将所有的外部模块排除打包
    plugins:get_exe_plugins(),
    optimization: {
        minimize: true, // 压缩Js代码
        minimizer: [
            new TerserPlugin({
                // extractComments: true,//不将注释提取到单独的文件中
            }),
        ],
    }

};
