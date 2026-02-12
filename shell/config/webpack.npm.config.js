const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const package_data = require("../../package.json")
const {base_url} = require("./env");
const {npm_externals} = require("./base.webpack.config");
module.exports = {
    target: 'node', // 指定打包结果运行在node环境下
    mode: 'production', // 或者 'production'
    entry: path.join(__dirname, "..", "..", "build", "server", "main", "server.js"), // 你的TypeScript入口文件路径
    output: {
        path: path.resolve(__dirname, "..", "..", "build"), // 输出目录
        filename: 'main.js', // 输出文件名
    },
    resolve: {
        extensions: ['.ts', '.js', '.node'] // 解析文件时自动补全的文件扩展名
    },
    module: {
        rules: [
        ]
    },
    externalsPresets: { node: true },
    externals: npm_externals,
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify('production'),
            'process.env.version': JSON.stringify(package_data.version),
            'process.env.base_url': JSON.stringify(base_url),
            // 'process.env.run_env': JSON.stringify("npm") // 必须用 JSON.stringify
        }),
        // new webpack.IgnorePlugin({ // 前面已经排除了可能含义.node的项目 这里就不需要了
        //     resourceRegExp: /\.node$/
        //     // contextRegExp: /moment$/,
        // }),
        // new webpack.IgnorePlugin({
        //     resourceRegExp: /Addon$/
        //     // contextRegExp: /moment$/,
        // }),
    ],
    optimization: {
        minimize: true, // 压缩Js代码
        minimizer: [
            new TerserPlugin({
                // extractComments: true,//不将注释提取到单独的文件中
            }),
        ],
    }
};
