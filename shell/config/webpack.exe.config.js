const path = require('path');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const package_data = require("../../package.json")
const {base_url} = require("./env");
const {plugins, _node_rules} = require("./base.webpack.config");

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
    externals: [
        {
            '@aws-sdk/client-s3': 'S3', // 假设全局变量名为 S3 是 @aws-sdk/client-s3带 @符号的话会无法压缩
            'cors':'commonjs cors' // 动态加载无法打包 如果需要可以使用 import "cors"
            // 'routing-controllers':'commonjs routing-controllers', // 有一些动态引入(他需要的动态引入也需要导入)，或者含有.node(使用用户自己安装编译的版本) 无法被打包 直接忽略这个包
        }
    ],
    // externals: [nodeExternals()], // 将所有的外部模块排除打包
    plugins,
    optimization: {
        minimize: true, // 压缩Js代码
        minimizer: [
            new TerserPlugin({
                // extractComments: true,//不将注释提取到单独的文件中
            }),
        ],
    }

};
