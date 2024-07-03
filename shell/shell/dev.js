
const { exec } = require('child_process');
const path = require("path");

console.log('dev');

// 执行第一个命令
const command1 = 'npm run server-dev';
exec(command1,{cwd:path.join(__dirname,'..')}, (error1, stdout1, stderr1) => {
    if (error1) {
        console.error(`Command 1 execution error: ${error1}`);
        return;
    }
    console.log(`Command 1 output: ${stdout1}`);
});



// 执行第二个命令
const command2 = 'npm run webpack-dev';
exec(command2,{cwd:path.join(__dirname,'..')}, (error2, stdout2, stderr2) => {
    if (error2) {
        console.error(`Command 2 execution error: ${error2}`);
        return;
    }
    console.log(`Command 2 output: ${stdout2}`);
});
