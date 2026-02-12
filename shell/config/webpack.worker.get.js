const path = require("path");
const package_data = require("../../package.json")
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const {base_url} = require("./env");
const {plugins, pkg_externals, npm_externals, _node_rules} = require("./base.webpack.config");

function get_webpack_work_config({entry_path,output_name,pkg,docker}) {
    const config = {
        target: 'node', // 指定打包结果运行在node环境下
        mode: 'production', // 或者 'production'
        entry: entry_path, // 你的TypeScript入口文件路径
        output: {
            path: path.resolve(__dirname, "..",'..',  "build"), // 输出目录
            filename: output_name, // 输出文件名
        },
        resolve: {
            extensions: ['.ts', '.js', '.node'] // 解析文件时自动补全的文件扩展名
        },
        externalsPresets: { node: true },
        optimization: {
            minimize: true, // 压缩Js代码
            minimizer: [
                new TerserPlugin({
                    // extractComments: true,//不将注释提取到单独的文件中
                }),
            ],
        },
        plugins,
        externals: npm_externals
    }
    if(pkg===true || docker===true) {
        // 整体打包需要二进制也进去
        config['module'] = {
            rules: _node_rules
        }
        config['externals'] = pkg_externals;
    }
    return config;
}

module.exports.get_webpack_work_config = get_webpack_work_config;