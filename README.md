## 说明
面向开发者的文件管理、服务器工具集合。
![image](https://github.com/xiaobaidadada/filecat/assets/61794688/516ef7db-65c6-4f2d-b6e6-18b35f6e81a7)
![image](https://github.com/xiaobaidadada/filecat/assets/61794688/97c630c5-6c0f-48d2-9a67-20b2ff86eae9)
![image](https://github.com/xiaobaidadada/filecat/assets/61794688/a3383438-57ff-43db-ae17-3e500d99ea5f)

## 主要特性
-  文件管理、文件在线编辑(双击)
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
1. 点对点客户端功能在macos下无法使用。很多功能没有在macos下测试过，只支持windwos和Linux;
2. 部分功能目前处于demo阶段，未来会持续优化；
## 路线
1. 支持更多的ddns平台
2. 修复与优化优化网络通信速度，更好的支持rdp和点对点
3. 优化进程信息获取、sft、rdp代理等
4. 语言国际化
3. 流媒体存储播放工具
## 致谢
本项目部分功能还基于或者借鉴于以下项目
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
