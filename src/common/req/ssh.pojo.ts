export class ShellInitPojo {
    rows:number;
    cols:number;
    init_path:string;
    dockerId:string;
    http_token:string;
}

export class SshPojo extends ShellInitPojo{
    username:string;
    password:string;
    private_path:string; //密码和私钥文件地址二选一
    domain:string;
    port:number;
    cmd:string; // shell使用
    dir:string; // 访问目录使用
    file:string; // 下载文件使用
    context:string; //额外参数
    files:string[]; // 多个文件暂时不用
    source:string;
    target:string; // 目标目录，用于文件移动操作
    public static getKey(obj:SshPojo) : string{
        return obj.domain+obj.port+obj.username;
    }
}


