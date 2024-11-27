const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const package_data = require("../../package.json")
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
            // {
            //     test: /\.js$/,  // 处理 JS 文件
            //     exclude: /node_modules/,  // 排除 node_modules 中的文件
            //     use: 'babel-loader',  // 如果需要，可以用 Babel 转译 JS 文件
            // }
        ]
    },
    externalsPresets: { node: true },
    externals: [
        {
            '@aws-sdk/client-s3': 'S3', // 假设全局变量名为 S3 是 @aws-sdk/client-s3带 @符号的话会无法压缩
            // 'routing-controllers':'commonjs routing-controllers', // 有一些动态引入(他需要的动态引入也需要导入)，或者含有.node(使用用户自己安装编译的版本) 无法被打包 直接忽略这个包
            'cors':'commonjs cors', // 动态加载无法打包 如果需要可以使用 import "cors"
            '@xiaobaidadada/node-pty-prebuilt':'commonjs @xiaobaidadada/node-pty-prebuilt',
            '@xiaobaidadada/node-tuntap2-wintun':'commonjs @xiaobaidadada/node-tuntap2-wintun',
            'node-process-watcher':'commonjs node-process-watcher',
            '@xiaobaidadada/ssh2-prebuilt':'commonjs @xiaobaidadada/ssh2-prebuilt',
        }
    ],
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify('production'),
        }),
        new webpack.DefinePlugin({
            'process.env.version': JSON.stringify(package_data.version),
        }),
        new webpack.DefinePlugin({
            'process.env.run_env': JSON.stringify("npm") // 必须用 JSON.stringify
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
                extractComments: true,//不将注释提取到单独的文件中
            }),
        ],
    }
};
