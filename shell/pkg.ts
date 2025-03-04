import {FileCompressType} from "../src/common/file.pojo";
import {FileService} from "../src/main/domain/file/file.service";


const fs = require('fs');
const path = require('path');

// 复制 node
fs.copyFileSync(process.execPath, path.join(__dirname, "..", "build", path.basename(process.execPath)));

const FileServiceImpl = new FileService();
const args = process.argv.slice(2);

if(args[0].includes("win")) {
    fs.copyFileSync(path.join(__dirname,"start","run.cmd"), path.join(__dirname, "..", "build", "run.cmd"));
} else  {
    fs.copyFileSync(path.join(__dirname,"start","run.sh"), path.join(__dirname, "..", "build", "run.sh"));
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
// args[0] 会在 package.json 所在目录下
FileServiceImpl.compress(FileCompressType.tar,9,args[0], filePaths, directorys,(v)=>{
    console.log(`压缩进度:${v.toFixed(2)}`)
},true)