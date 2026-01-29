
# ![](./src/web/meta/resources/img/logo-70.png) FileCat

FileCat 是一个基于 Web 的文件服务器、服务器管理工具。集成了文件管理、超大日志查看、远程终端访问、系统进程监控，以及包括 TUN、SSH、RDP、HTTP、TCP 等多种网络代理功能。支持windows、linux、mac。

**支持AI Agent用问答的方式来查询服务器资源，不再需要记住复杂的运维命令**。


FileCat is a web-based server management platform that provides file management, large-scale log viewing, remote terminal access, process monitoring, and various network proxies including TUN, SSH, RDP, HTTP, and TCP.

## 安装方式 / Installation
小的bug修复与功能更新，只会在npm上实时发布同步

Minor bug fixes and feature updates will only be released and synchronized in real time on npm.
### 1. Npm
`npm install -g filecat --registry https://registry.npmmirror.com `


部分功能作为一些npm子模块依赖，如果电脑访问github过慢，安装的时候会退化为本地c++编译，需要安装python3.8(不能太高)和c++编译器才能安装成功，否则会影响部功能的运行，windows下如果安装报错，是需要本地编译一些c++依赖，需要先安装python3和[vs_BuildTools](https://aka.ms/vs/17/release/vs_BuildTools.exe)(选择c++桌面，和Spectre 单独的包，安装这两个库)再执行安装.

### 2. Docker
`docker run -d \
  --name filecat \
  --restart=always \
  --net=host \
  -v /home:/home \
  ghcr.io/xiaobaidadada/filecat:latest \
  --port 5567 --base_folder /home`
### 3. Binary 二进制
Download the latest [Releases](https://github.com/xiaobaidadada/filecat/releases)

### 4. git clone
`git clone https://github.com/xiaobaidadada/filecat.git`

`npm install`

`npm run dev` or `npm run build && node dist/main.js`

## 运行/Running
运行 `filecat --port 5567`

account/password: admin/admin

更多参数可以使用 `filecat --help` 查看

## 功能概览 / Features
|           文件管理           |                                         代码编辑                                         |          多用户管理           |
|:------------------------:|:------------------------------------------------------------------------------------:|:------------------------:|
| ![](https://github.com/user-attachments/assets/46b67603-db28-4751-b0c1-4e1ae9cef0d2) | ![](https://github.com/user-attachments/assets/aa6cf4d9-1a0f-4d47-b48d-21c509ec1554) | ![](https://github.com/user-attachments/assets/09d968e5-cd72-4aa3-8351-12ea3c0d7031) |


|         10G 日志查看         |           系统信息           |                                      TUN客户端/服务器                                      |
|:------------------------:|:------------------------:|:------------------------------------------------------------------------------------:|
| ![](https://github.com/user-attachments/assets/20702c83-4f68-47cf-ae12-7694f19dea2a) | ![image](https://github.com/user-attachments/assets/9845638c-8298-4957-86cb-201b3ca2a7d9) | ![](https://github.com/user-attachments/assets/f7a746af-5645-4241-9e2e-69eace3b4ba1) |
|                                                                                                                                                                                                                                                                                                                                                                                                      AI问答                                                                                                                                                                                                                                                                                                                                                                                                       |                      |                                                                                      |
| ![](https://github.com/user-attachments/assets/14c7636e-ed6a-4f4e-ac3b-64b40f66b31f) |  |  |


- **文件管理**: 支持断点分块上传、多个根目录、代码\图片编辑、编辑器模式、白板绘图...
- **终端**：相比filebrowser使用了xterm.js，并且采用了虚拟shell完美实现命令的权限过滤，避免用户执行类似 rm -r / 的危险命令（所以使用终端命令行，就需要先在用户设置中设置命令权限）
- **CI/CD自动化构建**：内置了一个模仿github workflow 语法实现的自动化构建功能，作用于以.act结尾的文件
- **ssh代理**: 可以管理多个linux服务器，作用和winscp类似，让终端和文件管理更方便。除此之外还支持http代理，rdp远程桌面(windows)等代理
- **网站导航**: 记录管理自己的多个链接地址
- **系统、docker、进程 等信息的监控**: 对于系统进程查询，采用了高效的实现方式，监控全部进程的状态只需要非常小的cpu占用率
- **AI 问答**,通过与ai进行交互来执行命令获取服务器资源，同时支持权限过滤，避免AI执行危险命令行为（因此使用AI功能，需要先在用户设置中，给用户设置命令权限，建议设置 `*` 允许全部命令，在设置禁止不能执行的危险命令），需要自己注册配置任何符合openai风格的模型api。

More: https://filecat.xiaobaidadada.fun
##  qq群
824838674

##  Thanks
以下项目为 FileCat 提供了灵感或基础

- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
