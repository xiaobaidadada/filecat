const os = require('os')
const path = require('path')
const fs = require('fs')

function get_wintun_dll_arch() {
    let cpuArch = os.arch();
    switch (cpuArch) {
        case 'arm':
        case 'arm64':
            break;
        case 'ia32':
            cpuArch = "x86";
            break;
        case 'x64':
            cpuArch = "amd64";
            break;
        default:
            // console.log('未知架构:', arch);
            break;
    }
    return cpuArch;
}

function copy_wintun_dll() {
    try {
        if (os.platform() !== 'win32') return;
        const cpuArch = get_wintun_dll_arch();
        const winfilename = `wintun${cpuArch ? `-${cpuArch}` : ''}.dll`;
        // 获取模块的根目录
        const modPath = path.dirname(path.resolve("node_modules/@xiaobaidadada/node-tuntap2-wintun/package.json"));
        // 拼接你需要的路径
        const sourcePath = path.join(modPath, "wintun_dll", winfilename);
        const destPath = path.resolve('build',winfilename);
        // console.log("目录",sourcePath,destPath)
        // if (!fs.existsSync(destPath)) {
        fs.copyFileSync(sourcePath, destPath);
        // }
    } catch (e) {
        console.log(e);
    }
}

// 与项目通用文件
module.exports.get_wintun_dll_arch = get_wintun_dll_arch;
module.exports.copy_wintun_dll = copy_wintun_dll;