const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const TerserPlugin = require("terser-webpack-plugin");

const package_data = require("../../package.json")
const {base_url} = require("./env");
module.exports = {
    mode: 'production',
    entry: path.join(__dirname, "..", "..", "src", "web", "project", 'index.js'),
    output: {
        // path: path.resolve(__dirname, '..','..','dist'),
        // filename: 'bundle.js',
        filename: '[name].[contenthash].js',  // 使用 contenthash 进行文件名哈希 下次更新代码 浏览器缓存也会更新
        path: path.resolve(__dirname, '..', "..", 'build', 'dist'),
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx|tsx|ts)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        configFile: path.resolve(__dirname, '.babelrc'), // 指定 .babelrc 文件路径
                    },
                },
            },
            {
                test: /\.css$/, // 匹配所有以.css结尾的文件
                use: ['style-loader', 'css-loader'] // 使用style-loader和css-loader处理匹配到的文件
            },
            {
                test: /\.svg/,
                type: 'asset/inline'
            }
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.jsx'],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.join(__dirname, "..", "..", "src", "web", "project", 'index.html'),
        }),
        new webpack.DefinePlugin({
            'process.env': JSON.stringify(process.env),
            'process.env.version': JSON.stringify(package_data.version),
            'process.env.base_url': JSON.stringify(base_url),
        }),
        // new BundleAnalyzerPlugin({
        //     analyzerMode: 'server',  // 启动本地服务器查看分析报告
        //     openAnalyzer: true,      // 是否自动打开浏览器
        // })
    ],
    optimization: {
        minimize: true, // 压缩Js代码
        minimizer: [
            new TerserPlugin({
                // extractComments: true,//不将注释提取到单独的文件中
            }),
        ],
    },
    devServer: {
        static: [
            {directory: path.join(__dirname, "..", "..", "node_modules", "@excalidraw", "excalidraw", "dist","excalidraw-assets-dev"),},
            {directory: path.join(__dirname, "..", "..", "node_modules", "@excalidraw", "excalidraw", "dist","excalidraw-assets-dev","locales"),},
            {directory: path.join(__dirname, "..", "..", "src", "web", "project", './'),},
            {directory: path.join(__dirname, "..", "..", "src", "web", "project", 'component', "file", "component", "image", "js")},
            {directory: path.join(__dirname, "..", "..", "src", "web", "project", 'component', "toolbox", "rdp", "client", "js")},
            {directory: path.join(__dirname, "..", "..", "src", "web", "meta", 'resources', "img", "./",)},
            {directory: path.join(__dirname, "..", "..", "src", "web", "meta", 'resources', "css", "themes",)}
        ],
        port: 3301,
        open: false,
        // onListening: function (devServer) {
        //     if (!devServer) {
        //         throw new Error('webpack-dev-server is not defined');
        //     }
        //     // const port = devServer.server.address().port;
        //     console.log('Listening on port:', port);
        // },
        allowedHosts: "all", //  新增该配置项
    },
};
