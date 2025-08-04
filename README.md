
# ![](./src/web/meta/resources/img/logo-70.png) FileCat

FileCat 是一个基于 Web 的文件服务器、服务器管理工具。集成了文件管理、超大日志查看、远程终端访问、系统进程监控，以及包括 VPN、SSH、RDP、HTTP、TCP 等多种网络代理功能。

本项目是对[filebrowser](https://github.com/filebrowser/filebrowser)的功能增强，使用和filebrowser一样的ui，以服务器文件管理为基础添加一些服务器控制功能。

FileCat is a web-based server management platform that provides file management, large-scale log viewing, remote terminal access, process monitoring, and various network proxies including VPN, SSH, RDP, HTTP, and TCP.

❌ Mac Sys not supported yet , Windows \ Linux Sys is supported
## 安装方式 / Installation
 ### 1. Npm 
`npm install -g filecat --registry https://registry.npmmirror.com ` 
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

## 运行/Running
运行 `filecat --port 5567`

更多参数可以使用 `filecat --help` 查看

## 功能概览 / Features
|           文件管理           |                                         代码编辑                                         |          多用户管理           |
|:------------------------:|:------------------------------------------------------------------------------------:|:------------------------:|
| ![](https://github.com/user-attachments/assets/46b67603-db28-4751-b0c1-4e1ae9cef0d2) | ![](https://github.com/user-attachments/assets/aa6cf4d9-1a0f-4d47-b48d-21c509ec1554) | ![](https://github.com/user-attachments/assets/09d968e5-cd72-4aa3-8351-12ea3c0d7031) |


|         10G 日志查看         |           系统信息           |           vpn            |
|:------------------------:|:------------------------:|:------------------------:|
| ![](https://github.com/user-attachments/assets/20702c83-4f68-47cf-ae12-7694f19dea2a) | ![image](https://github.com/user-attachments/assets/9845638c-8298-4957-86cb-201b3ca2a7d9) | ![](https://github.com/user-attachments/assets/f7a746af-5645-4241-9e2e-69eace3b4ba1) |

- **文件管理**: 支持断点分块上传、多个根目录、代码\图片编辑、编辑器模式、白板绘图...
- **终端**：相比filebrowser使用了xterm.js，并且采用了虚拟shell完美实现命令的权限过滤，避免用户执行类似 rm -r / 的危险命令
- **CI/CD自动化构建**：内置了一个模仿github workflow 语法实现的自动化构建功能，作用于以.act结尾的文件
- **ssh代理**: 可以管理多个linux服务器，作用和winscp类似，让终端和文件管理更方便。除此之外还支持http代理，rdp远程桌面(windows)等代理
- **网站导航**: 记录管理自己的多个链接地址
- **系统、docker、进程 等信息的监控**: 对于系统进程查询，采用了高效的实现方式，监控全部进程的状态只需要非常小的cpu占用率
##  qq群
824838674

##  Thanks
以下项目为 FileCat 提供了灵感或基础

- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
