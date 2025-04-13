
# ![](./src/web/meta/resources/img/logo-70.png) filecat

- 中文 | [English ](./doc/EN_README.md)
- FileCat 用于帮助开发者搭建一个文件服务器，并提供众多与程序开发人员相关的必备功能。包括带有权限的远程终端(支持rdp桌面、终端命令拦截)、SSH代理、文件在线浏览\编辑\解压缩、白板绘图、自动化构建、系统监控、docker管理、超大日志实时读取等功能(目前可以运行在linux与windows系统下，不支持mac os系统)。
- 它是一个服务程序，使用web访问。可以使用npm执行`npm install filecat -g`全局安装命令，然后执行 `filecat`命令运行，使用参数`filecat --help`可以获取更多参数说明。也支持**二进制**方式直接运行，更多使用方式与参数请参考下文。
## 一. 截图
![展示](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## 二. 使用
### 1. 体验
url: http://filecat.xiaobaidadada.fun:5569/
- 账号密码: `admin`/`admin`
### 2. npm 方式运行
- 如果你的服务器上已经安装了node和npm，使用 `npm install filecat -g`全局安装，后然后使用`filecat`命令即可运行，或者`npm install filecat`安装到本项目下，使用`npx filecat `运行；
- 如果网络比较差，可以使用淘宝镜像源`npm config set registry https://registry.npmmirror.com`。或者，安装的时候临时使用淘宝镜像源`npm install -g filecat --registry https://registry.npmmirror.com`。
- 许多依赖是预构建放在github上的(支持node 16、18、20、22)，如果主机环境访问github很慢(多尝试几下也许就好了)，需要编译，查看报错后安装诸如`npm -g install node-addon-api`的依赖。实在访问不了github导致安装不了也可以使用下面的二进制或者docker运行。在windwos上编译可能遇到的问题可以查看这个链接 https://blog.csdn.net/jjocwc/article/details/134152602
### 3. 二进制文件方式运行
下载[最新release](https://github.com/xiaobaidadada/filecat/releases)
然后使用各个平台的解压缩包，里面包含了所有资源以及一个node.exe，然后使用里面使用的run脚本执行;目前只有x64架构的，arm需要自己构建;
1. 执行命令`run.cmd --port 5567 --base_folder /home ` 在linux下是`run.sh`； 不设置username的话，账号密码默认是admin
2. 使用例子中的配置文件，执行命令`run.sh --env ./env`；linux下也许需要执行`sudo chmod +x ./run.sh`获得执行权限
### 4. linux下安装到systemd后台运行
这里的安装是安装到systemd作为后台进程，默认需要使用root权限，对于Linux系统现在提供自动安装功能，推荐使用这种systemd方式运行;只需要下载最新版本的`filecat-linux`可执行程序后，给与它chod可执行权限，然后运行 `./filecat-linux --install linux`;如果你使用npm安装了filecat，可以直接使用`filecat --install linux`来安装到systemd。
### 5. docker 方式运行
使用`docker run -d --name filecat --restart=always --net=host -v /home:/home ghcr.io/xiaobaidadada/filecat:latest --port 5567 --base_folder /home`命令直接运行。

说明:
1. 所有的用于可执行的参数在这里都可用，也可以省略参数，那么参数会使用项目下的env文件。
2. 可以使用`-v`参数映射一个env配置文件给程序， `-v /home:/home`是管理文件的必要参数(使用`base_folder`参数设置)，否则能够看到的只是容器内的临时文件。
3. `--net=host`参数可以使用项目的所有关于网络的功能(虚拟网络，ddns等)，由于在容器内运行，系统基本信息有些获取不到，但是内存和cpu使用率还是可以获取到物理机的。
4. 如果只是想用文件管理功能，使用docker是可以的，否则还是建议在物理机上安装此程序。
## 三. 主要特性
-  文件管理
1. 图片，视频，markdown 等文件格式在线预览。
2. 代码编辑器，可选择文件打开方式。
3. 图片编辑器，对图片右键可以进入[图片编辑器](https://github.com/scaleflex/filerobot-image-editor)模式。
4. studio 编辑器，右键文件夹可以打开一个类似vscode的编辑器页面，可用于linux程序临时开发环境。
5. [excalidraw](https://github.com/excalidraw/excalidraw)绘图编辑器，这是一个很好用白板工具。
5. 切换根目录，在设置中添加多个文件夹路径后，可以在右上角选择切换根目录，只对一个session生效。
6. 终端，内嵌了一个自定义终端，可以实现任意命令的过滤，防止用户执行恶意的类似rm -rf / 命令，因为不是实际的pty环境，所以像node这样的软件想要交互式执行需要添加-i或者自定义处理函数，对于pty执行的程序虽然可以不用输出绝对路径，但是要输入文件的后缀，比如 cmd不能执行但是cmd.exe可以执行。
7. 超大文本日志查看器，对任意大小的文本右键使用作为日志类型查看，点击窗口后可以使用上下键来快速滚动翻页，还可以实时输出内容。
8. workflow 这是一个类似github workflow、jenkins 功能的本地自动化构建工具，创建文件的时候选择workflow模式，右键文件运行，也可以自己输入.workflow.yml后缀，不过这样没有文件预处理提示内容(这需要一定的权限才能进行)。
9. 支持文件的断点上传，分块并发上传。
- ssh代理,ftp代理: 可以管理多个linux服务器，作用和winscp类似，让终端和文件管理更方便。
- http代理,类似postman 的发送http请求功能，还可以作为服务器文件下载工具。
- 网站，是网址收藏夹，可用于保存服务器上其它的网站
- ddns
- http网页代理、rdp代理(windwos远程控制)、rtsp代理播放器，输入直播源，比如监控的url可以实时网页观看
- docker容器，镜像管理，查看日志等功能
- 系统内存cpu信息，进程cpu信息（利用c插件、使用极低的资源，实时查看系统全部进程信息，类似windows的任务管理器）,systemd管理(linux下才有)
- wol网络唤醒
- 虚拟网络实现一个轻量的vpn (p2p功能由于国内运营商对udp限制比较多，特别是移动几乎很多地区不可用，这个功能删除了不在做维护);
- 权限，支持各种系统权限，文件操作权限，命令权限.
## 四. 其它说明
1. 由于一些库目前不支持mac(比如虚拟网络) **mac下无法使用**上面的安装方式直接安装成功，在windows需要管理员模式下运行，linux需要root权限才可以使用该功能。此外还很多功能没有在macos下测试过，只支持windows和Linux;
2. 部分功能目前处于demo阶段，未来会持续优化；
3. 对于想要参与开发的朋友，只需要了解 ts语言，react框架，webpack打包，以及基本的node相关api即可。本项目的所有非dev依赖都是为了本项目而创建或者fork的，感兴趣的朋友也可以参与维护，都采用c++实现，本项目在install的时候会到github下载提前编译好的二进制文件，如果访问github网很差，会退化成本地编译，本地编译在不同的系统的需要安装不同的编译环境，至少目前所有的Ubuntu环境都自带编译c++的环境，只需要安装python就行，对于windows需要安装vs和python。
## 五. 路线
1. 优化更多操作细节
2. 支持更多的文件格式浏览
3. 支持更多的流媒体功能
4. 支持更多的ddns平台
5. 自动化爬虫
6. 优化虚拟网络，分布式文件同步
## 六. qq群
824838674
## 七. 致谢
本项目部分功能还基于或者借鉴于以下项目
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
