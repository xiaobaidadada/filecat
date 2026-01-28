const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取当前 package.json 路径
const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const optionalDeps = pkg.optionalDependencies || {};

console.log('Checking optional dependencies...');

for (const dep of Object.keys(optionalDeps)) {
    try {
        require.resolve(dep);
        console.log(`✅ ${dep} is already installed`);
    } catch (err) {
        console.log(`⚠️ ${dep} is missing, installing...`);
        try {
            // 使用 npm install 安装缺失依赖
            // 如果是全局安装，则安装到全局
            const globalFlag = process.env.npm_config_global ? '-g' : '';
            execSync(`npm install ${dep}@${optionalDeps[dep]} ${globalFlag}`, { stdio: 'inherit' });
            console.log(`✅ ${dep} installed successfully`);
        } catch (installErr) {
            console.error(`❌ Failed to install ${dep}:`, installErr.message);
        }
    }
}
