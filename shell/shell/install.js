const path = require("path");
const { exec } = require('child_process');

function isModuleInstalled(moduleName) {
    try {
        require.resolve(moduleName);
        return true;
    } catch (error) {
        return false;
    }
}
function installModule(moduleName) {
    return new Promise((resolve, reject) => {
        const command = `npm install ${moduleName}`;
        console.log(`Installing ${moduleName}...`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error installing ${moduleName}:`, stderr);
                reject(error);
            } else {
                console.log(`${moduleName} installed successfully.`);
                resolve(stdout);
            }
        });
    });
}
const package = require(path.join(process.cwd(), 'package.json'));

const devDependencies = package.devDependencies;
const dependencies = package.dependencies;

async function run () {
    for (const p of Object.keys(dependencies)) {
        if (!isModuleInstalled(p)) {
             installModule(`${p}@${dependencies[p].split('^')[1]}`);
        }
    }
    for (const p of Object.keys(devDependencies)) {
        if (!isModuleInstalled(p)) {
             installModule(`${p}@${devDependencies[p].split('^')[1]}`);
        }
    }
}
run();




