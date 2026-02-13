const fse = require("fs-extra");
const fs = require("fs");
const path = require("path");

/**
 * 自动复制文件或目录
 * @param {string} src 源路径
 * @param {string} dest 目标路径
 */
function copy_auto(src, dest) {

    if (!fs.existsSync(src)) {
        throw new Error(`源路径不存在: ${src}`);
    }

    const stat = fs.statSync(src);

    // ===== 如果是文件 =====
    if (stat.isFile()) {

        // 确保目标目录存在
        fse.ensureDirSync(path.dirname(dest));

        fs.copyFileSync(src, dest);
        return;
    }

    // ===== 如果是目录 =====
    if (stat.isDirectory()) {

        fse.copySync(src, dest, {
            overwrite: true,
            recursive: true,
            errorOnExist: false
        });

        return;
    }

    throw new Error("未知文件类型");
}

module.exports.copy_auto = copy_auto;

// copy_auto(path.join(process.cwd(),"node_modules","windows-shortcuts"), path.join(process.cwd(),"build","windows-shortcuts"))

