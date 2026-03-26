
# ![](./src/web/meta/resources/img/logo-70.png) FileCat

[English](./doc/EN_README.md) 

FileCat 是一个以文件管理为核心的服务器管理工具。通过配置服务器文件路径，用户可以在简洁直观的 Web 界面中管理服务器文件，同时集成命令终端、Docker 管理、网络代理等多种运维功能，实现统一的服务器管理体验。

**现在支持AI 聊天的方式询问服务器资源，管理服务器，不再需要记住复杂的Linux命令**;

定制化开发联系qq: 1643220580

## Demo
http://demo.filecat.xiaobaidadada.fun/

username/password: demo/demo
中文账号 demo-zh/demo

demo服务器由[ 野草云 ](https://my.yecaoyun.com/aff.php?aff=7185)赞助提供
## 安装方式 
小的bug修复与功能更新，只会在npm上实时发布同步

### 1. Npm


`npm install -g filecat --registry`


建议使用node20，部分功能作为一些npm子模块依赖，如果电脑访问github过慢，安装的时候会退化为本地c++编译，需要安装python3.8(不能太高)和c++编译器才能安装成功，否则会影响部功能的运行，windows下如果安装报错，是需要本地编译一些c++依赖，需要先安装python3和[vs_BuildTools](https://aka.ms/vs/17/release/vs_BuildTools.exe)(选择c++桌面，和Spectre 单独的包，安装这两个库)再执行安装.

### 2. Docker
`docker run -d \
  --name filecat \
  --restart=always \
  --net=host \
  -v /home:/home \
  ghcr.io/xiaobaidadada/filecat:latest \
  --port 5567 --base_folder /home`
### 3.  二进制
下载最新 [Releases](https://github.com/xiaobaidadada/filecat/releases)

### 4. Git Clone
`git clone https://github.com/xiaobaidadada/filecat.git`

`npm install`

`npm run dev` or `npm run build && node dist/main.js`

## 运行
运行 `filecat --port 5567`

account/password: admin/admin

更多参数可以使用 `filecat --help` 查看

## 功能概览 
|           文件管理           |                                         代码编辑                                         |          多用户管理           |
|:------------------------:|:------------------------------------------------------------------------------------:|:------------------------:|
| ![](https://github.com/user-attachments/assets/46b67603-db28-4751-b0c1-4e1ae9cef0d2) | ![](https://github.com/user-attachments/assets/aa6cf4d9-1a0f-4d47-b48d-21c509ec1554) | ![](https://github.com/user-attachments/assets/09d968e5-cd72-4aa3-8351-12ea3c0d7031) |


|         10G 日志查看         |           系统信息           |                                      TUN客户端/服务器                                      |
|:------------------------:|:------------------------:|:------------------------------------------------------------------------------------:|
| ![](https://github.com/user-attachments/assets/20702c83-4f68-47cf-ae12-7694f19dea2a) | ![image](https://github.com/user-attachments/assets/9845638c-8298-4957-86cb-201b3ca2a7d9) | ![](https://github.com/user-attachments/assets/f7a746af-5645-4241-9e2e-69eace3b4ba1) |
|                                                                                                                                                                                                                                                                                                                                                                                                      AI问答                                                                                                                                                                                                                                                                                                                                                                                                       |                      |                                                                                      |
| ![](https://github.com/user-attachments/assets/14c7636e-ed6a-4f4e-ac3b-64b40f66b31f) |  |  |


- **文件管理**: 支持断点分块上传、多个根目录、代码\图片编辑、编辑器模式、白板绘图，文件分享...
- **终端**：相比filebrowser使用了xterm.js，并且采用了虚拟shell完美实现命令的权限过滤，避免用户执行类似 rm -r / 的危险命令（所以使用终端命令行，就需要先在用户设置中设置命令权限）
- **CI/CD自动化构建**：内置了一个模仿github workflow 语法实现的自动化构建功能，作用于以.act结尾的文件
- **ssh代理**: 可以管理多个linux服务器，作用和winscp类似，让终端和文件管理更方便。除此之外还支持http代理，rdp远程桌面(windows)等代理
- **网站导航**: 记录管理自己的多个链接地址
- **系统、docker、进程 等信息的监控**: 对于系统进程查询，采用了高效的实现方式，监控全部进程的状态只需要非常小的cpu占用率
- **AI 问答**: 通过与ai进行交互来执行命令获取服务器资源，同时支持权限过滤，避免AI执行危险命令行为（因此使用AI功能，需要先在用户设置中，给用户设置命令权限，建议设置 `*` 允许全部命令，在设置禁止不能执行的危险命令），需要自己注册配置任何符合openai风格的模型api。另外还支持本地知识库全文检索的rag方式增强ai能力。
- **超大日志查看**: 采用文件分片读取的方式，不管多大的文本文件都可以做到秒开
- **虚拟Tun网络**: 可以进行客户端和服务器模式的tun网络建立，让多个具有公网或者内容的电脑拥有虚拟ip，进行局域网形式的通信
- **虚拟Tcp网络**: 采用客户端和服务器模式，服务器可以控制客户端，让客户端在当前网络环境中进行tcp通信代理



##  qq群
824838674

##  Thanks
以下项目为 FileCat 提供了灵感或基础

- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
