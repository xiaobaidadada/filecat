
# ![](./src/web/meta/resources/img/favicon-32x32.png) filecat

- 中文 | [English ](./doc/EN_README.md)
- 这是一个面向开发者的文件管理、服务器工具集合(web服务)。
你可以使用该软件在自己的家里使用任意一台主机，利用ddns或者穿透功能实现一个自己的个人网盘，或者用来简单管理一个linux服务器。需要访问家庭中的路由器后台等局域网受限的网址的时候，你可以利用rdp、ssh、网页代理功能轻松实现这一目的
## 截图
![image](https://github.com/user-attachments/assets/98a77c5f-e6f8-44ee-a136-f6fc5c0be459)
![image](https://github.com/xiaobaidadada/filecat/assets/61794688/97c630c5-6c0f-48d2-9a67-20b2ff86eae9)
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
- 项目目前使用pkg打包，请使用node18.x.x
- install 如果失败可能是由于网络问题，单独install一下对应的依赖包。
## 主要特性
-  文件管理、编辑、解压缩、格式转换等，shell功能会一直跟着目录走。
- 终端、ssh代理
- ddns
- ftp代理(ssh文件管理)
- http网页代理
- rdp代理(windwos远程控制)
- rtsp代理播放器
- docker容器，镜像管理，查看日志等功能
- 系统内存，cpu信息,systemd
- wol网络唤醒
- 点对点通信,vpn
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
