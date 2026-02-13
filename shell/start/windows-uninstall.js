const ws = require("windows-shortcuts");
const path = require("path");
const fs = require("fs");

// =====================
// 开始菜单快捷方式
// =====================
const shortcutPath = path.join(
    process.env.APPDATA,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Filecat",
    "Filecat.lnk"
);

// =====================
// 开机自启快捷方式
// =====================
const startupShortcutPath = path.join(
    process.env.APPDATA,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
    "Filecat.lnk"
);

// =====================
// 安全删除目录
// =====================
function removeDirSafe(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log("已删除目录:", dir);
    }
}

// =====================
// 安全删除文件
// =====================
function removeFileSafe(file) {
    if (fs.existsSync(file)) {
        fs.rmSync(file, { force: true });
        console.log("已删除文件:", file);
    }
}

// =====================
// 删除开机自启
// =====================
function removeStartupShortcut() {
    if (fs.existsSync(startupShortcutPath)) {
        removeFileSafe(startupShortcutPath);
        console.log("已移除开机自启");
    }
}

// =====================
// 主逻辑
// =====================
if (!fs.existsSync(shortcutPath)) {
    console.log("找不到开始菜单快捷方式，尝试仅删除开机自启...");

    removeStartupShortcut();

    console.log("卸载完成（仅移除自启）");
    process.exit(0);
}

// 读取快捷方式
ws.query(shortcutPath, (err, options) => {

    if (err) {
        console.error("读取快捷方式失败:", err);
        process.exit(1);
    }

    if (!options.target) {
        console.error("快捷方式未包含目标路径");
        process.exit(1);
    }

    // 获取真实文件路径
    const targetFile = options.target;

    // 获取安装目录
    const installDir = path.dirname(targetFile);

    console.log("检测到安装目录:", installDir);

    try {

        // 删除安装目录
        removeDirSafe(installDir);

        // 删除开始菜单快捷方式
        removeFileSafe(shortcutPath);

        // 删除开始菜单文件夹
        removeDirSafe(path.dirname(shortcutPath));

        // 删除开机自启
        removeStartupShortcut();

        console.log("卸载完成");

    } catch (e) {
        console.error("卸载失败:", e.message);
    }

    process.exit(0);
});
