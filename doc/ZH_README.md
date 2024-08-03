## 说明
- 这是一个面向开发者的文件管理、服务器工具集合(web服务)。
  你可以使用该软件在自己的家里使用任意一台主机，利用ddns或者穿透功能实现一个自己的个人网盘，或者用来简单管理一个linux服务器。需要访问家庭中的路由器后台等局域网受限的网址的时候，你可以利用rdp、ssh、网页代理功能轻松实现这一目的。
- 本项目的网页ui是基于filebrowser项目的，filebrowser偏向于普通用户使用不能满足作为一个软件开发人员的更多功能需要，所以才有了这个项目，我是觉得filebrowser ui挺好看的所以就直接复制了。
## 截图
![image](https://github.com/user-attachments/assets/98a77c5f-e6f8-44ee-a136-f6fc5c0be459)
![image](https://github.com/xiaobaidadada/filecat/assets/61794688/97c630c5-6c0f-48d2-9a67-20b2ff86eae9)
## 主要特性
-  文件管理、文件在线编辑(双击)，文件解压缩，视频格式转换等功能
- 终端、ssh代理
- ddns
- ftp代理
- http网页代理
- rdp代理
- docker监控查看
- 系统内存，cpu信息
- wol网络唤醒
- 点对点通信
## 使用
### 直接使用
下载[最新release](https://github.com/xiaobaidadada/filecat/releases)
然后使用各个平台的可执行程序运行;
1. 执行命令`filecat --port 5567 --base_folder d:/ `  不设置username的话，账号密码默认是admin
2. 使用例子中的配置文件，执行命令`filecat --env ./env`；linux下也许需要执行`sudo chmod +x ./filecat-linux`获得执行权限
### 开发
项目目前使用pkg打包，请使用node18.x.x
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
