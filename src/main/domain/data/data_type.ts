
// 数据库 json 文件
export enum file_key {
    data = "data.json",
    systemd = "systemd.json",
    http_tag = "http_tag.json", // 专门用于 http post 功能的
    navindex_key = "navindex_key.json", // 专门用于 网址 导航的
    data_version = "data_version"
}
// 数据目录
export enum data_dir_tem_name {
    tempfile = "tempfile", // 临时文件
    http_tempfile = "http_tempfile", // http 请求的临时文件
    all_user_api_file_dir = "datafile" , // 用户的 自定义 api 临时目录 datafile 之前用过了 兼容一下
    sys_file_dir = "sys_file_dir", // 系统目录 和用户的临时分开 不让用户自定义的文件重复了
}
// todo 现在都是加载到内存 如果对于用户特别多的情况 做持久化选择
// key
export enum data_common_key {
    // 用户相关
    username = "username", // 作废
    password = "password", // 作废
    password_hash = "password_hash", // 作废

    navindex_remote_ssh_key = "navindex_remote_ssh_key",
    user_id_name_mapping = "user_id_name_mapping", // 每个用户都有一个唯一 递增数字 id 与 username 做对应关系 name 是key id 是值
    user_id_info_data_mapping = "user_id_info_data_mapping", // 用户基本信息 id _mapping
    user_unique_id_num = "user_unique_id_num", // 全局用户递增用户 id 用数字表示

    role_unique_id_num = "role_unique_id_num",
    sys_all_roles = "sys_all_roles", // 系统上所有的角色

    ddns_http_url_key = "ddns_http_url_key",
    ddns_tx_key = "tengxun_ddns_key",
    ddns_dnspod_key = "ddns_dnspod",
    ddns_ali_key = "ali_ddns_key",
    navindex_net_key_list = "navindex_net_key_list",
    navindex_wol_key = "navindex_wol_key",
    customer_router_key = "customer_router_key",
    customer_api_router_key = "customer_api_router_key",
    token_setting = "token_setting",
    files_pre_mulu_key = "files_pre_mulu_key", // 废弃 文件目录
    sys_software = "sys_software",
    extra_env_path = "extra_env_path",
    protection_directory = "sys_protection_directory",
    self_auth_jscode = "self_auth_jscode",
    navindex_video_key = "navindex_video_tag_key",
    systemd_key = "systemd_key",
    vir_server_data_key = "vir_server_net_data_key",
    vir_client_data_key = "vir_client_net_data_key",
    vir_data_client_hash_key = "vir_data_client_hash_key",
    vir_data_server_hash_key = "vir_data_server_hash_key",
    language = "user_language", // 废弃
    navindex_rdp_key = "navindex_rdp_tag_key",
    // 独立文件部分
    navindex_key = "navindex_key_list",
    http_tag_key = "http_tag_key",
    // 自定义shell cmd 检测
    self_shell_cmd_check_open_status = "self_shell_cmd_check_open_status",
    self_shell_cmd_jscode = "self_shell_cmd_jscode", // js code 文件名字
}


// data_version 数据库 版本
export enum data_version_type{
    undefine = 0,
    filecat_not = 1, // 没有使用版本的阶段
    filecat_1 = 2 , // 这个版本会 将navindex_key http_tag_key 独立文件检测独立拷贝出来
}

export function is_data_version_type(value) {
    return Object.values(data_version_type).includes(value);
}