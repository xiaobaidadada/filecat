const path = require('path');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const package_data = require("../../package.json")
const {base_url} = require("./env");

// 给js代码注入一些环境变量
const plugins = [
    new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.version': JSON.stringify(package_data.version),
        'process.env.base_url': JSON.stringify(base_url),
        // 'process.env.run_env': JSON.stringify("exe") // 必须用 JSON.stringify
    }),
    // new webpack.DefinePlugin({
    //     'process.platform': JSON.stringify(process.platform) // 这里将 process.platform 替换为实际的值 在遇到动态打包的时候require 可以判断类型 函数内部的无法判断
    // }),
    // 不要一些Debug的二进制文件
    new webpack.IgnorePlugin({
        resourceRegExp: /Debug/,
    })
];

// 处理 node 二进制文件的webpack rules
const _node_rules = [
    {
        test: /\.node$/,
        loader: 'node-loader',
        options: {
            name: '[path][name].[ext]'
        }
    }
]

// 这些不需要打包，会被安装，运行的时候再使用
const npm_externals =[
    {
        '@aws-sdk/client-s3': 'S3', // 假设全局变量名为 S3 是 @aws-sdk/client-s3带 @符号的话会无法压缩
        // 'routing-controllers':'commonjs routing-controllers', // 有一些动态引入(他需要的动态引入也需要导入)，或者含有.node(使用用户自己安装编译的版本) 无法被打包 直接忽略这个包
        'cors':'commonjs cors', // 动态加载无法打包 如果需要可以使用 import "cors"
        '@xiaobaidadada/node-pty-prebuilt':'commonjs @xiaobaidadada/node-pty-prebuilt',
        '@xiaobaidadada/node-tuntap2-wintun':'commonjs @xiaobaidadada/node-tuntap2-wintun',
        'node-process-watcher':'commonjs node-process-watcher',
        '@xiaobaidadada/ssh2-prebuilt':'commonjs @xiaobaidadada/ssh2-prebuilt',
    }
]
const pkg_externals =[
    {
        '@aws-sdk/client-s3': 'S3', // 假设全局变量名为 S3 是 @aws-sdk/client-s3带 @符号的话会无法压缩
        'cors':'commonjs cors' // 动态加载无法打包 如果需要可以使用 import "cors"
        // 'routing-controllers':'commonjs routing-controllers', // 有一些动态引入(他需要的动态引入也需要导入)，或者含有.node(使用用户自己安装编译的版本) 无法被打包 直接忽略这个包
    }
]

module.exports.plugins = plugins;
module.exports._node_rules = _node_rules;
module.exports.npm_externals = npm_externals;
module.exports.pkg_externals = pkg_externals;