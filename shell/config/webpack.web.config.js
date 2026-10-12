const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Mustache = require('mustache');
const webpack = require('webpack');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const TerserPlugin = require("terser-webpack-plugin");

const package_data = require("../../package.json")
const {base_url} = require("./env");
const {common_plugins} = require("./base.webpack.config");

/**
 * dev 下 index.html 由 webpack-dev-server 直接吐给浏览器，不经过后端 Mustache.render，
 * 模板里的 {{{web_site_title}}} 这类占位符会原样显示成 "dev 占位符"。
 * 这里只在 dev 用同一个模板引擎渲染；production 保持原模板输出，
 * 交给后端 get_index_html() 用真实环境配置渲染。
 */
const INDEX_TEMPLATE = path.join(__dirname, "..", "..", "src", "web", "project", 'index.html');
function render_index() {
    const tpl = fs.readFileSync(INDEX_TEMPLATE, 'utf8');
    return Mustache.render(tpl, {
        Windows_FileCat: JSON.stringify({
            base_url,
            web_site_title: "FileCat",
            logo_url: ""
        }),
        web_site_title: "FileCat",
        logo_favicon: "favicon-32x32.png"
    });
}

const is_dev = process.env.NODE_ENV !== 'production';
module.exports = {
    mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
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
            },
            {
                // 数学公式（KaTeX）用的字体。webpack 5 默认不认识字体文件，
                // 不加这条规则 import katex 的样式会直接报 Module parse failed。
                // 输出到 dist 根目录（不带子目录）：后端静态资源是按 basename 找文件的
                // （见 main.ts 的 path.basename），放子目录里反而取不到。
                test: /\.(woff2?|ttf|otf|eot)$/,
                type: 'asset/resource',
                generator: {
                    filename: '[name].[contenthash][ext]',
                },
            },
            {
                test: /workflow.yml/,
                type: 'asset/source', // 直接把文件内容导出为字符串
            },
            {
                test: /\.m?js/,
                resolve: {
                    fullySpecified: false, // 关闭对文件扩展名的严格要求
                },
            },
        ],
    },
    resolve: {
        // .mjs 不能省：mermaid 等包的 exports 直接指向 .mjs 产物，
        // webpack 按这份扩展名列表去找入口，缺了就会报 Can't resolve
        extensions: ['.tsx', '.ts', '.js', '.jsx', '.mjs'],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: INDEX_TEMPLATE,
            // dev 才预先渲染占位符；production 保持原样，交给后端 Mustache.render
            ...(is_dev ? { templateContent: render_index() } : {}),
            inject: true,
        }),
        new webpack.DefinePlugin(common_plugins),
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
        // splitChunks: {
        //     chunks: 'all', // 对所有 chunk 进行优化
        //     maxInitialRequests: Infinity,
        //     minSize: 20000, // 超过 20kb 的模块进行拆分
        //     cacheGroups: {
        //         // 将所有 node_modules 中的库打包为一个 vendors 文件
        //         vendors: {
        //             test: /[\\/]node_modules[\\/]/,
        //             name(module) {
        //                 // 获取包名，将第三方库按包名拆分，防止 vendors.js 过大
        //                 const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
        //                 return `npm.${packageName.replace('@', '')}`;
        //             },
        //         },
        //     },
        // },
    },
    devServer: {
        static: [
            // {directory: path.join(__dirname, "..", "..", "node_modules", "@excalidraw", "excalidraw", "dist","excalidraw-assets-dev"),},
            {
                directory: path.join(__dirname, "..", "..", "node_modules", "@excalidraw", "excalidraw", "dist", "dev", "fonts"),
                publicPath: "/fonts" // 重点：将 URL 中的 /fonts 映射到上述物理文件夹 多个路径可以一样 按优先级查找
            },
            {directory: path.join(__dirname, "..", "..", "src", "web", "project", './'),},// web index.js
            {directory: path.join(__dirname, "..", "..", "src", "web", "project", 'component', "file", "component", "image", "js")},
            {directory: path.join(__dirname, "..", "..", "src", "web", "project", 'component', "proxy", "rdp", "client", "js")},
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
