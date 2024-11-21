const readline = require('readline');
const fs  = require('fs');
const { spawn ,execSync} = require('child_process');
// 创建 readline 接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
let exe_path;
if (process.argv[0].endsWith("node") && process.argv[1].endsWith("filecat")) {
    // 通过 脚本运行
    exe_path = `${process.argv[0]} ${process.argv[1]} `
} else {
    exe_path = process.argv[0];
}
const data = {
    exe_path:exe_path,
    env_path:"",
    port:5567,
    username:"admin",
    password:"admin",
    work_dir:`${process.cwd()}/data`,
    base_folder:process.cwd(),
    Group:"root",
    User:"root"
};
// 提问函数
const askQuestion = (query) => {
    return new Promise((resolve) => rl.question(query, resolve));
};
const step = {
    "1":async ()=>{
        const input = await askQuestion(`\x1b[31m1.\x1b[0m程序位置-绝对路径(当前-${data.exe_path}):`);
        if (input) {
            data.exe_path = input;
        }
        const User = await askQuestion(`\x1b[31m\x1b[0m请输入用户账号(默认:root):`);
        if (User) {
            data.User = User;
            const Group = await askQuestion(`\x1b[31m\x1b[0m请输入用户所属组(默认:${User}):`);
            if (Group) {
                data.Group = Group;
            } else {
                data.Group = User;
            }
        }
        return "2";
    },
    "2":async ()=>{
        const input = await askQuestion(`\x1b[31m2.\x1b[0m请输入env文件-绝对路径:`);
        if (!input) {
            return "3";
        } else {
            data.env_path = input;
        }
        return "";
    },
    "3":async ()=>{
        // 获取多个参数
        const port = await askQuestion(`\x1b[31m3/7.\x1b[0m请输入程序端口(默认:5567):`);
        if (port) {
            data.port = parseInt(port);
        }
        const username = await askQuestion(`\x1b[31m4/7.\x1b[0m请输入登录名(默认:admin):`);
        if (username) {
            data.username = username;
        }
        const password = await askQuestion(`\x1b[31m5/7.\x1b[0m请输入密码(默认:admin):`);
        if (password) {
            data.password = password;
        }
        const work_dir = await askQuestion(`\x1b[31m6/7.\x1b[0m请输入程序缓存数据目录(默认:程序目录下data):`);
        if (work_dir) {
            data.work_dir = work_dir;
        }
        const base_folder = await askQuestion(`\x1b[31m7/7.\x1b[0m请输入管理root文件目录(默认:程序目录下):`);
        if (base_folder) {
            data.base_folder = base_folder;
        }
        return "";
    }
}
// 主函数
const main = async () => {
    let key = "1";
    for(;;) {
        const r = await step[key]();
        if (!r) {
            break;
        }
        key = r;
    }
    // 关闭 readline 接口
    rl.close();
    let param;
    if (data.env_path) {
        param = ` --env ${data.env_path}`
    } else {
        param = ` --username ${data.username} --password ${data.password} --port ${data.port} --work_dir ${data.work_dir} --base_folder ${data.base_folder}`
    }
    const model = `
[Unit]
Description=filecat
After=network.target

[Service]
ExecStart=${data.exe_path} ${param}
Restart=always
User=${data.User}
Group=${data.Group}
KillMode=process
[Install]
WantedBy=multi-user.target
    `
    try {
        fs.writeFileSync("/etc/systemd/system/filecat.service", model);
        execSync(`sudo chmod +x ${data.exe_path}`)
        execSync(`sudo systemctl daemon-reload`)
        execSync(`sudo systemctl start filecat`)
        execSync(`sudo systemctl enable filecat`)
    } catch (e ){
        console.error(e);
    }
    console.log("安装完成！");
    process.exit();
};

// 执行主函数
main().catch((error) => {
    console.error('出现错误:', error);
    process.exit();
});
