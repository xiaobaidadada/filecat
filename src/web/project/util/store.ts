import {atom, RecoilState, useRecoilState} from 'recoil';
import {FileTypeEnum, GetFilePojo} from "../../../common/file.pojo";
import {WsClient} from "../../../common/frame/ws.client";
import {UserBaseInfo} from "../../../common/req/user.req";
import {Confirm} from "../component/prompts/Confirm";
import {FileMenuData} from "../../../common/FileMenuType";
import {DiskDevicePojo} from "../../../common/req/sys.pojo";

const localStorageEffect = key => ({setSelf, onSet}) => {
    const savedValue = localStorage.getItem(key);
    if (savedValue != null) {
        setSelf(JSON.parse(savedValue));
    }

    onSet(newValue => {
        localStorage.setItem(key, JSON.stringify(newValue));
    });
};

export class ShowPromptData {
    show: boolean;
    type: string;
    overlay: boolean;
    data: FileMenuData;
}

export const $stroe = {
    // 当前的所有文件
    nowFileList: atom({
        key: 'nowFileList', // 唯一标识符，用于区分不同的原子状态
        default: {
            folders: [{name: "文件夹1"}, {name: "文件夹2"}],
            files: [{name: "文件1", type: FileTypeEnum.text}, {name: "文件2", type: FileTypeEnum.text}]
        } as GetFilePojo // 初始值
    }),
    // 按下的键盘按键
    enterKey: atom({
        key: "enterKey",
        default: ""
    }),
    // 选中的文件 下标
    selectedFileList: atom({
        key: 'selectedFileList', // 唯一标识符，用于区分不同的原子状态
        default: [] // 初始值
    }),
    // 选中要被复制的文件名列表 不是下标
    copyedFileList: atom({
        key: 'copyedFileList', // 唯一标识符，用于区分不同的原子状态
        default: [] // 初始值
    }),
    // 剪切
    cutedFileList: atom({
        key: 'cutedFileList', // 唯一标识符，用于区分不同的原子状态
        default: [] // 初始值
    }),
    // 临时作为单击和双击判断条件 下标
    clickFileList: atom({
        key: 'clickFileList', // 唯一标识符，用于区分不同的原子状态
        default: [] // 初始值
    }),
    // 目前只用于 shell远程文件操作，控制当前目录的进退
    shellNowDir: atom({
        key: 'shellNowDir',
        default: []
    }),
    fileShowType: atom({
        key: 'fileShowType',
        default: ""
    }),

    // 上传队列中的文件
    uploadFiles: atom({
        key: 'uploadFiles',
        default: []
    }),
    // 一次上传一个文件，当前文件的上传进度
    nowProgress: atom({
        key: 'nowProgress',
        default: {
            name: '',
            value: 1,
            index: 0
        }
    }),
    // 通用 prompt 是否显示
    showPrompt: atom(
        {
            key: 'showPrompt',
            default: new ShowPromptData()
        }
    ),
    // 通用确认
    confirm: atom({
        key: 'confirm',
        default: {
            open: false,
            handle: null
        } as {
            open: boolean,
            handle: () => void,
            title?: string,
            sub_title?: string,
        }
    }),
    // 通用卡片
    prompt_card: atom({
        key: "prompt_card",
        default: {open: false} as {
            context_div?: any,
            open: boolean,
            title?: string
        }
    }),
    // 编辑器设置
    editorSetting: atom({
        key: 'editorSetting',
        default: {
            model: 'text',
            open: false,
            fileName: '',
            save: null,
        } as {
            menu_list?: any[],
            model?: string,
            open?: boolean,
            fileName?: string,
            save?: any,
        }
    }),
    // shell是否开启 并传递初始目录
    fileShellShow: atom({
        key: "shellShow",
        default: {
            show: false,
            path: ''
        }
    }),
    // 只是隐藏不消失
    file_shell_hidden: atom({
        key: 'file_shell_hidden',
        default: undefined
    }),
    // 远程shell是否开启
    remoteShellShow: atom({
        key: "remoteShellShow",
        default: {
            show: false,
            path: ''
        }
    }),
    // docker 的shell是否开启
    dockerShellShow: atom({
        key: 'dockerShellShow',
        default: {
            type: "", // print exec
            show: false,
            dockerId: ""
        }
    }),
    // systemd 的shell是否开启
    systemd_shell_show: atom({
        key: 'systemd_shell_show',
        default: {
            show: false,
            unit_name: ""
        }
    }),
    // ssh工具连接信息
    sshInfo: atom({
        key: 'sshInfo',
        default: {}
    }),
    // 文件根路径主
    file_root_index: atom({
        key: 'file_root_index',
        default: null,
        effects: [
            localStorageEffect("file_root_index")
        ]
    }),
    // root根路径
    file_root_list: atom({
        key: 'file_root_list',
        default: [],
        effects: [
            localStorageEffect("file_root_list")
        ]
    }),
    // 用户基本信息
    user_base_info: atom({
        key: 'user_base_info',
        default: {} as UserBaseInfo,
        effects: [
            localStorageEffect("user_base_info")
        ]
    }),
    // 自定义选项
    custom_fun_opt: atom({
       key: 'custom_fun_opt',
       default: null,
       effects: [
           localStorageEffect("custom_fun_opt")
       ]
    }),
    // 头部菜单状态
    header_min: atom({
        key: 'header_min',
        default: false
    }),
    // 文件预览
    file_preview: atom({
        key: 'file_preview',
        default: {open: false} as { open: boolean, type?: FileTypeEnum, name?: string, url?: string, context?: string },
    }),
    // md预览
    markdown: atom({
        key: 'markdown',
        default: {} as { filename?: string, context?: string },
    }),
    // 编辑器
    studio: atom({
        key: 'studio',
        default: {} as { folder_path?: string, name?: string }
    }),
    // 图片编辑器
    image_editor: atom({
        key: 'image_editor',
        default: {} as { path?: string, name?: string }
    }),
    // excalidraw编辑器
    excalidraw_editor: atom({
        key: 'excalidraw_editor',
        default: {} as { path?: string, name?: string }
    }),
    // 磁盘
    disk: atom({
        key: "disk",
        default: {
            type: ""
        } as { type?: string, data?: DiskDevicePojo }
    })
}




