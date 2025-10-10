import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {InputText, Select} from "../../../meta/component/Input";
import {fileHttp} from "../../util/config";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {FileCompressType} from "../../../../common/file.pojo";
import {CardPrompt} from "../../../meta/component/Card";

const workflow_txt = `

name: test  # 名字 不支持 {{}}
run-name: 构建项目 # 用于日志显示的名字

# import-files: # 导入多个文件的配置 用于下面的 use-yml 指令
#     - ./ok.yml
inputs:
  job: # 输入参数的 key 子字段只是为了修饰 调用的时候 使用  {{{job}}} 会添加并覆盖到 env 中的值
    description: "任务参数"
    required: true # 是否必须
    default: build # 默认值
    options:
      - false
      - '1232'

env: # 定义一些环境变量 这些 环境变量可以在 run 或者 cwd 中 或者 run-name 中使用  {{}} 来表达 使用的时候 必须要用 '' 字符串括起来，不然会被处理成变量 {{{ }}} 是非转义方式 采用 Mustache js
  version: 1
  cmd_install: npm install
  token: 123
  # 有几个参数是每次执行自动添加的
#  filecat_user_id: 1 # 用户id
#  filecat_user_name: admin # 用户名字
#  filecat_user_note: 备注 #用户备注

username: admin # 需要执行用户的账号 该脚本需要运行在某个用户下
user_id: 1 # 会覆盖 username 对应的用户 id 只允许特定设置的用户在这里可以被设置 运行

# 所有的jobs下的任务都会被并行执行
jobs:
  build-job1:
    if: 1==1 # 判断这个job要不要执行
    cwd: E:\\test # 需要一个实际的执行目录 默认是当前的yml所在目录 目录内的文件清理需要自己使用命令操作 必须是绝对路径
    name: 第一阶段执行
    repl: false # 交互式运行 当上一个step 运行没有结束 有输出的时候 就执行下一个 step 默认是 false 必须要自己设置好流程 避免出现一直等待 那么只能手动关闭了，使用repl 无法使用 use-yml if process_exit 等特殊 指令
    # need-job: build-job2 # 需要别的job先完成 只能是本文件内的
    sys-env: # 这里的token 会在执行的添加到shell的环境变量中
      token: {{{token}}}
    env:
      temp: '{{token}}123' # 用于设置一些临时变量
    steps: # 这些脚本会按顺序执行
      - use-yml: test2 # 使用其它 yml 文件中的 name
        with-env:
             version: 18 # 使用其它文件的时候 给一些环境变量参数
      #   - run: pip.exe install setuptools
      #   - run: npm.cmd install
      #   - run: ok1
      #   - run: ls
      - run: npm run build
    #   - run: npm publish # 执行一些脚本
  build-job2:
    cwd: E:\\test2
    name: 第二阶段
    steps:
      - if: 1==2 # 判断这个step要不要执行
        run: ls
        process_exit: 0  # 程序 退出 输入数字  0 -1


`

export function FileNew(props) {
    const { t } = useTranslation();
    const [format, setFormat] = useState("");

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [name, setName] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const select_item = [
        {title:`${t("empty")}`,value:""},
        {title:`excalidraw${t("格式")}`,value:".draw"},
        {title: `workflow${t("格式")}`, value:".act"},
    ]
    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{}})
    }
    const dirnew = async ()=>{
        if (!name) {
            cancel()
            return;
        }
        let r_name = name;
        let context = "";
        if (format) {
            if (!name.endsWith(format)) {
                r_name = name+format;
            }
            if (format === ".draw" ) {
                context = "{}";
            } else if (format === ".act") {
                context = workflow_txt;
            }
        }
        const fileName = `${showPrompt.data.dir}${r_name}`
        const rsq = await fileHttp.post('new/file', {name:fileName,context})
        if (rsq.code === 0) {
            cancel();
            if (showPrompt.data.call) {
                showPrompt.data.call();
            } else {
                navigate(getRouterPath());
            }
        }
    }

    return (<CardPrompt title={t("创建文件")} cancel={cancel} confirm={dirnew} cancel_t={t("取消")}
                        confirm_t={t("创建")}
                        context={[
                            <div className="card-content">
                                <InputText placeholderOut={t("输入文件名")} value={name}
                                           handleInputChange={(value) => setName(value)}/>
                                <Select value={format} onChange={(value:FileCompressType)=>{
                                    setFormat(value);
                                }} options={select_item}/>
                            </div>]}
                        confirm_enter={dirnew}
    />)
}
