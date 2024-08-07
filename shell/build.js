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
                        copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "tun","ts","linux","linuxtun.node"), path.join(__dirname, "..", "build", "linuxtun.node"))
                        copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "tun","ts","win","wintun.node"), path.join(__dirname, "..", "build", "wintun.node"))
                        copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-amd64.dll"), path.join(__dirname, "..", "build", "wintun-amd64.dll"))
                        copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-arm.dll"), path.join(__dirname, "..", "build", "wintun-arm.dll"))
                        copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-arm64.dll"), path.join(__dirname, "..", "build", "wintun-arm64.dll"))
                        copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-x86.dll"), path.join(__dirname, "..", "build", "wintun-x86.dll"))

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
                        copyFileSync(path.join(__dirname, "..", "src", "web", "project", "component","toolbox","rdp","client","js","rle.js"), path.join(__dirname, "..", "build", "dist","rle.js"))
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
