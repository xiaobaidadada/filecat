import {FileSettingItem, SysSoftware, SysSoftwareItem} from "./setting.req";

export class UserLogin {
    username: string;
    password: string;
    hash_password?: string;
    user_id?: string;
}


export enum SysEnum {
    win,
    linux
}

export class UserBaseInfo {
    language: string; // 废弃字段
    sys: SysEnum; // 系统
    sysSoftWare: { [key in SysSoftware]: SysSoftwareItem } | {};
    runing_time_length: any; // 系统运行的时间
    user_data: UserData; // 用户数据
    dir_user_upload_max_num: { path: string, user_upload_num?: number, sys_upload_num?: number }[];
}


export enum UserAuth {
    sys_process_close = 1,
    docker_container_update = 2,
    docker_images_delete = 3,
    systemd_update = 4,
    vir_net = 5, // 和虚拟网络有关系的所有功能
    token_update = 6, // token 过期时间
    code_auth = 7, // 自定义 auth
    code_resource = 8, // 自定义 code 资源
    code_api = 9, // 自定义 api 功能
    update_password = 10, // 修改密码
    net_site_tag_update = 11, // 网址收藏修改
    ssh_proxy_tag_update = 12, // ssh 代理标签修改
    http_proxy_tag_update = 13, // http 代理标签修改
    browser_proxy_tag_update = 14, // 浏览器代理标签修改
    rdp_proxy_tag_update = 15, // rdp 代理标签修改
    wol_proxy_tag_update = 16, // 网络唤醒代理标签修改
    rtsp_proxy_tag_update = 17, // rtsp 播放器代理标签修改
    sys_disk_mount = 18, // 系统磁盘挂载操作
    ddns = 19, // 所有和ddns有关的功能
    crypto_ssh_file = 20, // 非对称密钥保存到文件
    outside_software_path = 21, // 外部软件路径
    user_manage = 22, // 用户管理
    filecat_file_delete_cut_rename = 23, // 非命令的filecat文件删除功能 剪切 重命名
    // filecat_file_cut = 24, // 废弃
    // filecat_file_rename = 25,  // 废弃
    filecat_file_context_update_upload_created_copy_decompression = 26,// 文件创建 文件内容更新 上传 复制 解压缩
    filecat_file_context_update = 27, // 仅仅是内容更新 这个和上一个有一个可以，就可以更新
    shell_cmd_check = 28, // cmd shell 命令 检测是否能运行
    role_manage = 29, //角色管理
    env_path_update = 30,  // 环境路径管理
    pty_cmd_update = 31, // pty cmd 环境更新
    sys_protection_dir = 32,// 系统保护路径  所有用户都有的
    recycle_file_save = 33, // 文件垃圾回收
    ssh_proxy, // ssh 代理功能
    http_proxy, // http 代理功能
    browser_proxy, // 浏览器代理功能
    rdp_proxy, // rdp 代理功能
    wol_proxy, // 网络唤醒功能
    rtsp_proxy, // rtsp 功能
    workflow_exe, // workflow 执行 功能
    workflow_exe_user, // 能被设置执行的 workflow 用户
    workflow_api, // workflow 自定义触发api
    dir_upload_max_num = 43, // 目录上传数量限制
    http_proxy_download_cancel, // 关闭下载
    // customer_api_pre_key, // 自定义api前缀修改 todo 放弃了 下次用 46开始
    sys_env_setting_key, // 全局变量设置
}


export enum FileListShowTypeEmum {
    block = "",
    list = "list",
    gallery = "gallery",
}

export enum DirListShowTypeEmum {
    defualt = "", // 操作系统默认的 ； NTFS  默认按字母顺序存储目录项 Ext4、APFS、XFS 等 返回的文件顺序是 文件系统的原始存储顺序（不保证按字母顺序）
    time_minx_max = "time_minx_max", // 时间从小到大排序
    time_max_min = "time_max_min",
    size_min_max = "size_min_max", // 从小到大
    size_max_min = "size_max_min", // 从大到小排序
    name = "name" // 按字母顺序排序
}

export class UserData extends UserLogin {
    cwd: string; // 目录顶级范围 (role 作用)
    access_dirs: string[] = []; // cwd 是第一个 这里是其它的可访问的 (role 作用)
    not_access_dirs: string[] = []; // 禁止访问的目录 (role 作用)
    only_read_dirs: string[] = []; // 只读的目录
    note: string; // 备注
    id: string; // 用户 id
    language: string; // (role 作用)
    access_cmd: string; // 可以执行的命令 使用 空格区分多个 (role 作用)

    auth_list: UserAuth[] = [];  // 权限 (role 作用)
    is_root: boolean; // 是否是root账号

    folder_items: FileSettingItem[]; // 多个切换文件夹的选项
    folder_item_now: number; // 当前使用的哪个选项 一般是默认的位置
    protection_directory: any[]; // 保护目录
    bind_role_id: string; // 绑定的角色id

    // 用于角色的
    role_id: string;
    role_name: string;
    role_note: string; // 角色备注

    // 用于额外的属性
    file_list_show_type: FileListShowTypeEmum;
    dir_show_type: DirListShowTypeEmum; // 目录列表样式
    not_pre_show_image:boolean; // 是否预览图片
}
