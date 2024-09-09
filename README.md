
# ![](./src/web/meta/resources/img/logo-70.png) filecat

- 中文 | [English ](./doc/EN_README.md)
- 这是一个面向开发者的文件管理、服务器工具集合(web服务)。
你可以使用该软件在自己的家里使用任意一台主机，利用ddns或者穿透功能实现一个自己的个人网盘，或者用来简单管理一个linux服务器。需要访问家庭中的路由器后台等局域网受限的网址的时候，你可以利用rdp、ssh、网页代理功能轻松实现这一目的，本项目不同于宝塔这样的高度可视化操作软件，而是提供一个方便又简洁、简单、好看的文件管理工具，从而更好的使用ssh.
## 截图
![展示](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## 使用
### 体验
url: http://116.198.245.137:5569/
账号密码: `admin`/`admin`暂时没有权限功能，请不要修改密码，影响别人体验
### 直接使用
下载[最新release](https://github.com/xiaobaidadada/filecat/releases)
然后使用各个平台的可执行程序运行;
1. 执行命令`filecat --port 5567 --base_folder d:/ `  不设置username的话，账号密码默认是admin
2. 使用例子中的配置文件，执行命令`filecat --env ./env`；linux下也许需要执行`sudo chmod +x ./filecat-linux`获得执行权限
### linux下安装
对于Linux系统现在提供自动安装功能，推荐使用这种systemd方式运行;只需要下载最新版本的`filecat-liunx`可执行程序后，给与它chod可执行权限，然后运行 `./filecat-linux --install linux`;
### 开发
- 项目目前使用pkg打包，请使用node18.x.x，不打包也要使用node18,一些插件目前只支持node18；
- install 如果失败可能是由于网络问题，单独install一下对应的依赖包。
## 主要特性
-  文件管理
  - 图片，视频，markdown 等文件格式在线预览。
  - 代码编辑器，可选择文件打开方式。
  - sutdio 编辑器，右键文件夹可以打开一个类似vscode的编辑器页面，可用于linux程序临时开发环境。
  - 切换根目录，在设置中添加多个文件夹路径后，可以在右上角选择切换根目录，只对一个session生效。
  - 终端，可以实时跟着目录走。
- ssh代理,ftp代理: 可以管理多个linux服务器，作用和winscp类似，让终端和文件管理更方便。
- ddns
- http网页代理
- rdp代理(windwos远程控制)
- rtsp代理播放器
- docker容器，镜像管理，查看日志等功能
- 系统内存，cpu信息,systemd
- wol网络唤醒
- 虚拟网络，可以实现p2p,vpn功能。
## 功能说明
1. 点对点客户端功能在macos下无法使用，在windows需要管理员模式下运行，linux需要root权限才可以使用该功能。此外还很多功能没有在macos下测试过，只支持windwos和Linux;
2. 部分功能目前处于demo阶段，未来会持续优化；
## 路线
1. 支持更多的ddns平台
2. 修复与优化优化网络通信速度，更好的支持rdp和点对点
3. 优化进程信息获取、sft、rdp代理等
4. 流媒体存储播放工具
## 致谢
本项目部分功能还基于或者借鉴于以下项目
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
