import {atom, RecoilState, useRecoilState} from 'recoil';
import {FileTypeEnum} from "../../../common/file.pojo";
import {WsClient} from "../../../common/frame/ws.client";

export class ShowPromptData {
    show:boolean;
    type: string;
    overlay:boolean;
    data:any;
}
export const $stroe = {
    // 当前的所有文件
    nowFileList: atom({
        key: 'nowFileList', // 唯一标识符，用于区分不同的原子状态
        default: {
            folders: [{name: "文件夹1"}, {name: "文件夹2"}],
            files: [{name: "文件1", type: FileTypeEnum.text}, {name: "文件2", type: FileTypeEnum.text}]
        } // 初始值
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
    // 编辑器设置
    editorSetting:atom({
        key: 'editorSetting',
        default:{
            model:'text',
            open:false,
            fileName:'',
            save:null
        }
    }),
    // 编辑器内容
    editorValue:atom({
        key: 'editorValue',
        default:'123'
    }),
    // shell是否开启 并传递初始目录
    fileShellShow:atom({
        key:"shellShow",
        default:{
            show:false,
            path:''
        }
    }),
    // 远程shell是否开启
    remoteShellShow:atom({
        key:"remoteShellShow",
        default:{
            show:false,
            path:''
        }
    }),
    // docker 的shell是否开启
    dockerShellShow:atom({
        key: 'dockerShellShow',
        default:{
            type:"", // print exec
            show:false,
            dockerId:""
        }
    }),
    // ssh工具连接信息
    sshInfo:atom({
        key: 'sshInfo',
        default:{}
    }),
    // 文件根路径
    file_root_index:atom({
        key: 'file_root_index',
        default:null
    })
}




