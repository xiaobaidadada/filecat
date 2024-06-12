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
## 使用
### 直接使用
下载[最新release](https://github.com/xiaobaidadada/filecat/releases/tag/%E5%88%9D%E5%A7%8B%E5%8C%96)
然后使用各个平台的可执行程序运行;
1. `filecat --port 5567 --base_folder d:/ `  不设置username的话，账号密码默认是admin
2. 使用例子中的配置文件 `filecat --env ./env`
### 开发
项目目前使用pkg打包，请使用node18.x.x
## 路线
1. 支持更多的ddns平台
2. 优化进程信息获取、sft、rdp代理等
3. 语言国际化
3. 流媒体存储播放工具
4. 网络点对点通信
## 致谢
本项目部分功能还基于或者借鉴于以下项目
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
