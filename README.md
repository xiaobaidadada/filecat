
# ![](./src/web/meta/resources/img/logo-70.png) FileCat

<p align="left">
  <!-- npm 下载量 -->
  <a href="https://www.npmjs.com/package/filecat">
    <img src="https://img.shields.io/npm/dm/filecat.svg" alt="npm downloads">
  </a>

  <!-- npm 版本 -->
  <a href="https://www.npmjs.com/package/filecat">
    <img src="https://img.shields.io/npm/v/filecat.svg" alt="npm version">
  </a>

  <!-- GitHub stars -->
  <a href="https://github.com/xiaobaidadada/filecat">
    <img src="https://img.shields.io/github/stars/xiaobaidadada/filecat.svg" alt="stars">
  </a>


  <!-- Docker pulls -->
  <a href="https://ghcr.io/xiaobaidadada/filecat">
    <img src="https://img.shields.io/badge/docker-ghcr.io-blue.svg" alt="docker">
  </a>

  <!-- license -->
  <a href="https://github.com/xiaobaidadada/filecat/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/xiaobaidadada/filecat.svg" alt="license">
  </a>
</p>

[English Doc](./doc/EN_README.md) 

FileCat 是一个web文件服务器、也是一个轻量级的服务器管理工具。部署在服务器上后，即可浏览服务器上的文件，支持多种文件格式在线浏览(图片、视频、绘图、Markdown等)

在文件管理的基础上，filecat集成了很多服务器运维与管理的功能，让你同时拥有一个轻量级的服务器管理工具，这些功能能够帮助用户更方便的访问和操作服务器上的文件


## 部分功能截图
### 文件列表
![](./doc/文件列表.png)
### 内网穿透
![](./doc/内网穿透.png)
### 系统信息看板
![](./doc/系统信息看板.png)
### AI能力
![](./doc/AI能力.png)

除了以上功能之外，还支持一些可能会对你有帮助的功能，任意大小的文本日志文件秒开，windows远程桌面，图片简单编辑，CI/CD工作流，excalidraw绘图 ...

## Demo
http://demo.filecat.xiaobaidadada.fun/

username/password: demo/demo
中文账号 demo-zh/demo

demo服务器由[ 野草云 ](https://my.yecaoyun.com/aff.php?aff=7185)赞助提供
## 安装方式 
小的bug修复与功能更新，只会在npm上实时发布同步

### 1. Npm


`npm install -g filecat `

对于Linux系统，安装完以后，你可选择使用pm2来保活，或者使用 `filecat --install`来注册到systemd

### 2. Linux curl 

`curl -o install.sh https://filecat.xiaobaidadada.fun/files/linux-install.sh && bash install.sh`

在linux系统下可以执行该命令，将自动下载二进制包并执行安装程序，按照提示输入参数即可。 

### 3.  二进制
下载最新 [Releases](https://github.com/xiaobaidadada/filecat/releases)

### 4. Docker
`docker run -d --name filecat --restart=always --net=host -v /home:/home ghcr.io/xiaobaidadada/filecat:latest --port 5567 --base_folder /home`

### 5. Git Clone
`git clone https://github.com/xiaobaidadada/filecat.git`

`npm install`

`npm run dev` or `npm run build && node dist/main.js`

## 运行
安装完以后运行命令 `filecat --port 5567`

默认账号/密码: admin/admin

更多参数可以使用 `filecat --help` 查看

使用提示：权限功能是必须要注意的，安装以后，默认能够访问的服务器文件目录就是安装目录，你需要在设置中设置每个用户能够访问的目录，以及能够执行的权限。

## 升级
1. 使用自定义的安装方式进行升级，比如npm 安装的就使用 npm -g i filecat，docker 可以重新pull镜像，二进制安装的可以重新下载替换。
2. 从5.33.0 版本以后，可以使用 `filecat-upgrade` 命令来进行升级，会自动根据安装环境进行升级。对于docker和二进制安装的方式，filecat-upgrade 命令还支持一个自定义下载url路径参数（默认是从github下载最新包）。


##  qq群
824838674

##  Thanks
以下项目为 FileCat 提供了灵感或基础

- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)


## 软件对比

| 软件名称         | ![](./src/web/meta/resources/img/logo-70.png) [FileCat](https://github.com/xiaobaidadada/filecat) | <img width="48" src="https://github.com/user-attachments/assets/c40b22c9-33da-47b7-bc4c-ce69bb5cc174" > [Quantum](https://github.com/gtsteffaniak/filebrowser) | <img width="48" src="https://raw.githubusercontent.com/filebrowser/filebrowser/master/branding/banner.png" > [Filebrowser](https://github.com/filebrowser/filebrowser) |
|--------------|---------|--|-------------------------------------------------------------------------------------------------------------------------|
| 文件系统支持       |   ✅      |  ✅ | ✅                                                                                                                       |
| Linux        |     ✅    | ✅ | ✅                                                                                                                       |
| Windows      |     ✅    | ✅ | ✅                                                                                                                        |
| Mac          |      ✅   |   ✅|          ✅                                                                                                               |
| 自己部署         | ✅|✅|✅|
| webdav 支持    | ❌|✅|❌|
| 用户登陆支持       | ✅|✅|✅|
| 终端shell      |✅|❌|❌|
| 开源           |✅|✅|✅|
| 单点登录支持       |✅|✅|❌|
| 可分享的网页链接     |✅|✅|✅|
| 基于文本的文件编辑器   |✅|✅|✅|
 | 详细使用手册       | ❌|✅|✅|
| Office 文件预览  |❌|✅|❌|
| 索引搜索         |❌|✅|❌|
| 多文件系统路径挂载    |✅|✅|❌|
 | 内网穿透         |✅|❌|❌|
 | ssh终端        |✅|❌|❌|
 | 实时系统信息       |✅|❌|❌|
 | windows 远程桌面 |✅|❌|❌|
 | 命令CI/CD工作流支持 |✅|❌|❌|
 | 超大日志文件查看     |✅|❌|❌|
 | ai agent     |✅|❌|❌|
 