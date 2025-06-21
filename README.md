
# ![](./src/web/meta/resources/img/logo-70.png) FileCat

FileCat 是一个基于 Web 的服务器管理工具，集成了文件管理、超大日志查看、远程终端访问、系统进程监控，以及包括 VPN、SSH、RDP、HTTP、TCP 等多种网络代理功能。

FileCat is a web-based server management platform that provides file management, large-scale log viewing, remote terminal access, process monitoring, and various network proxies including VPN, SSH, RDP, HTTP, and TCP.

本软件是基于[filebrowser](https://github.com/filebrowser/filebrowser)的ui与文件管理功能、添加了 系统管理、远程代理、CI/CD自动化构建、VPN 等诸多与开发人员平时用到的功能，目的是成为一个简洁好用的服务器管理工具，也可以说是服务器控制面板。
## 安装方式 / Installation
 ### 1. Npm 
`npm install -g filecat --registry https://registry.npmmirror.com ` 使用 `filecat --port 5567 `
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

##  在线演示 / Demo

[http://demo.filecat.xiaobaidadada.fun/](http://demo.filecat.xiaobaidadada.fun/)

账号密码: `admin`/`admin`. english account: `en_admin`/`en_admin`. 演示主机由[亚洲云](https://www.asiayun.com/)提供.


## 功能概览 / Features
|           文件管理           |                                         代码编辑                                         |          多用户管理           |
|:------------------------:|:------------------------------------------------------------------------------------:|:------------------------:|
| ![](https://github.com/user-attachments/assets/46b67603-db28-4751-b0c1-4e1ae9cef0d2) | ![](https://github.com/user-attachments/assets/aa6cf4d9-1a0f-4d47-b48d-21c509ec1554) | ![](https://github.com/user-attachments/assets/09d968e5-cd72-4aa3-8351-12ea3c0d7031) |


|         10G 日志查看         |           系统信息           |           vpn            |
|:------------------------:|:------------------------:|:------------------------:|
| ![](https://github.com/user-attachments/assets/20702c83-4f68-47cf-ae12-7694f19dea2a) | ![image](https://github.com/user-attachments/assets/9845638c-8298-4957-86cb-201b3ca2a7d9) | ![](https://github.com/user-attachments/assets/f7a746af-5645-4241-9e2e-69eace3b4ba1) |


##  qq群
824838674

##  Thanks
以下项目为 FileCat 提供了灵感或基础

- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
