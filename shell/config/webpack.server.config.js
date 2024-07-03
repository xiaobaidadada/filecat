const path = require('path');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
    target: 'node', // 指定打包结果运行在node环境下
    mode: 'production', // 或者 'production'
    entry: path.join(__dirname,"..","..","build","server","main","server.js"), // 你的TypeScript入口文件路径
    output: {
        path: path.resolve(__dirname, "..","..","build"), // 输出目录
        filename: 'main.js', // 输出文件名
    },
    resolve: {
        extensions: ['.ts','.js'] // 解析文件时自动补全的文件扩展名
    },
    module: {
        rules: [
            {
                test: /\.(ts|js)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            "@babel/preset-env",
                        ]
                    }
                },
            },
        ]
    },
    externals: [nodeExternals()], // 将所有的外部模块视为外部依赖
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify('production'),
        }),
        new webpack.IgnorePlugin({
            resourceRegExp: /^\.\/.*?\.node$/
            // contextRegExp: /moment$/,
        })
    ],
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,//不将注释提取到单独的文件中
            }),
        ],
    }

};
