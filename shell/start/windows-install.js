const ws = require("windows-shortcuts");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

// 当前脚本所在目录
// const currentDir = process.cwd();
const currentDir = __dirname;


// 默认安装目录
const defaultInstallDir = "C:\\Program Files\\Filecat";

// 需要启动的 cmd
const CMD_NAME = "filecat-run.cmd";

// 开始菜单目录
const startMenuDir = path.join(
    process.env.APPDATA,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Filecat"
);

// =====================
// 递归复制目录
// =====================
function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// =====================
// 创建快捷方式
// =====================
function createShortcut(installDir) {
    const cmdPath = path.join(installDir, CMD_NAME);
    const shortcutPath = path.join(startMenuDir, "Filecat.lnk");

    fs.mkdirSync(startMenuDir, { recursive: true });

    ws.create(shortcutPath, {
        target: cmdPath,
        workingDir: installDir,
        desc: "Filecat 启动程序"
    }, (err) => {
        if (err) {
            console.error("创建快捷方式失败:", err);
        } else {
            console.log("开始菜单快捷方式创建成功！");
        }
    });
}

// =====================
// 安装主流程
// =====================
function install(installDir) {

    const cmdSrc = path.join(currentDir, CMD_NAME);

    if (!fs.existsSync(cmdSrc)) {
        console.error("找不到 filecat-start.cmd");
        return;
    }

    try {
        console.log("正在复制文件...");

        copyDir(currentDir, installDir);

        console.log("文件复制完成");

        createShortcut(installDir);

        console.log("安装成功！");
        console.log("Win 键搜索 Filecat 即可启动");

    } catch (e) {
        console.error("安装失败:", e.message);
    }
}

// =====================
// 用户交互
// =====================
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("========== Filecat 安装程序 ==========");
console.log("默认安装目录:");
console.log(defaultInstallDir);
console.log("");

rl.question("回车确认安装，或输入自定义安装路径：", (inputPath) => {

    const installDir = inputPath.trim() || defaultInstallDir;

    console.log("");
    console.log("安装路径:", installDir);

    rl.question("确认安装？(y/n): ", (confirm) => {

        if (confirm.toLowerCase() !== "y") {
            console.log("已取消安装");
            rl.close();
            return;
        }

        rl.close();
        install(installDir);
    });
});
