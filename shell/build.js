const {Listr} = require("listr2");
const webpack = require('webpack');
const config = require('./config/webpack.config.js');
const serverConfig = require('./config/webpack.server.config.js');
const {copyFileSync} = require("fs");
const path = require("path");
const {rimraf} = require("rimraf");
const fse = require("fs-extra");


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
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "bin", "win-process.node"), path.join(__dirname, "..", "build", "win-process.node"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "bin", "linux-process.node"), path.join(__dirname, "..", "build", "linux-process.node"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "tun","ts","linux","linuxtun.node"), path.join(__dirname, "..", "build", "linuxtun.node"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "tun","ts","win","wintun.node"), path.join(__dirname, "..", "build", "wintun.node"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-amd64.dll"), path.join(__dirname, "..", "build", "wintun-amd64.dll"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-arm.dll"), path.join(__dirname, "..", "build", "wintun-arm.dll"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-arm64.dll"), path.join(__dirname, "..", "build", "wintun-arm64.dll"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "net", "wintun-x86.dll"), path.join(__dirname, "..", "build", "wintun-x86.dll"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "bin", "ffmpeg"), path.join(__dirname, "..", "build", "ffmpeg"))
                        // copyFileSync(path.join(__dirname, "..", "src", "main", "domain", "bin", "ffmpeg.exe"), path.join(__dirname, "..", "build", "ffmpeg.exe"))
                        rimraf(path.join(__dirname,"..","build","server"));
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
                        fse.copySync(path.join(__dirname, "..", "src", "web", "meta", 'resources',"assets","excalidraw-assets"),path.join(__dirname, "..", "build", "dist","excalidraw-assets"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "project", 'component',"file","component","image","js","filerobot-image-editor.min.js"), path.join(__dirname, "..", "build", "dist","filerobot-image-editor.min.js"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "project", "component","toolbox","rdp","client","js","rle.js"), path.join(__dirname, "..", "build", "dist","rle.js"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "meta","resources","img","favicon-16x16.png"), path.join(__dirname, "..", "build", "dist","favicon-16x16.png"));
                        copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "resources","img","favicon-32x32.png"), path.join(__dirname, "..", "build", "dist","favicon-32x32.png"));
                        // copyFileSync(path.join(__dirname, "..", "src", "web", "meta", "component","resources","img","svg.png"), path.join(__dirname, "..", "build", "dist","svg.png"))
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
