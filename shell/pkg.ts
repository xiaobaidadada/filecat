import {FileCompressType} from "../src/common/file.pojo";
import {FileService} from "../src/main/domain/file/file.service";
import {fileCompress} from "../src/main/domain/file/file.compress";
import {download_ripgrep} from "../src/main/domain/bin/download-ripgrep";


const fs = require('fs');
const path = require('path');
const {copy_auto} = require('./util/file');

// 复制 node
fs.copyFileSync(process.execPath, path.join(__dirname, "..", "build", path.basename(process.execPath)));

const FileServiceImpl = new FileService();
const args = process.argv.slice(2);

if(args[0].includes("win")) {
    fs.copyFileSync(path.join(__dirname,"start","filecat-run.cmd"), path.join(__dirname, "..", "build", "filecat-run.cmd"));
    fs.copyFileSync(path.join(__dirname,"start","filecat-install.cmd"), path.join(__dirname, "..", "build", "filecat-install.cmd"));
    fs.copyFileSync(path.join(__dirname,"start","filecat-uninstall.cmd"), path.join(__dirname, "..", "build", "filecat-uninstall.cmd"));
    fs.copyFileSync(path.join(__dirname,"start","windows-install.js"), path.join(__dirname, "..", "build", "windows-install.js"));
    fs.copyFileSync(path.join(__dirname,"start","windows-uninstall.js"), path.join(__dirname, "..", "build", "windows-uninstall.js"));
    copy_auto(path.join(process.cwd(),"node_modules","windows-shortcuts"), path.join(__dirname, "..", "build", "node_modules","windows-shortcuts"))
} else  {
    fs.copyFileSync(path.join(__dirname,"start","filecat-run.sh"), path.join(__dirname, "..", "build", "filecat-run.sh"));
    fs.copyFileSync(path.join(__dirname,"start","filecat-install.sh"), path.join(__dirname, "..", "build", "filecat-install.sh"));
}

const filePaths: string[] = [], directorys: string[] = [];
const root_path = path.join(__dirname, "..", "build");
for (const file of fs.readdirSync(root_path)) {
    const name = path.join(root_path, decodeURIComponent(file));
    try {
        const stats = fs.statSync(name);
        if (stats.isFile()) {
            filePaths.push(name);
        } else {
            directorys.push(name);
        }
    } catch (e) {
    }
}

async function run() {
    await download_ripgrep()
    // args[0] 会在 package.json 所在目录下
    await fileCompress.compress("tar",9,args[0], filePaths, directorys,(v)=>{
        console.log(`压缩进度:${v.toFixed(2)}`)
    },true)
}
run()