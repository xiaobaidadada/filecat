const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: path.join(__dirname,"..","..","src","web","project",'index.js'),
    output: {
        // path: path.resolve(__dirname, '..','..','dist'),
        filename: 'bundle.js',
        path: path.resolve(__dirname, '..',"..",'build','dist'),
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
            }
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js','.jsx'],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.join(__dirname,"..","..","src","web","project",'index.html'),
        }),
    ],
    devServer: {
        static:{
            directory: path.join(__dirname,"..","..","src","web","project", './'),
        },
        port: 3001,
        open: false,

        allowedHosts: "all", //  新增该配置项
    },
};
