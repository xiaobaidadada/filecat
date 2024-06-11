const {Listr} = require("listr2");
const webpack = require('webpack');
const config = require('./config/webpack.config.js');
const serverConfig = require('./config/webpack.server.config.js');
const {copyFileSync} = require("fs");
const path = require("path");
const {rimraf} = require("rimraf");

const tasksLister = new Listr(
    [
        {
            title: "构建服务端",
            task: async () => {
                return new Promise((res, rej) => {
                    webpack(serverConfig, (err, stats) => {
                        if (err || stats.hasErrors()) {
                            console.error(err || stats.toString());
                            rej(false);
                            return;
                        }
                        copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "sys", "win-process.node"), path.join(__dirname, "..", "build", "win-process.node"))
                        rimraf(path.join(__dirname,"..","build","server"));
                        console.log('构建服务端完成');
                        res(true);
                    });

                })

            },
        },
        {
            title: "构建web",
            task: async () => {
                return new Promise((res, rej) => {
                    webpack(config, (err, stats) => {
                        if (err || stats.hasErrors()) {
                            console.error(err || stats.toString());
                            rej(false);
                            return;
                        }
                        console.log('构建web完成');
                        res(true);
                    });
                })
            },
            options: {persistentOutput: true},
        },
    ],
    {
        exitOnError: false,
    }
);
tasksLister.run();