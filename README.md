
# ![](./src/web/meta/resources/img/logo-70.png) filecat

- 中文 | [English ](./doc/EN_README.md)
- 使用[filebrowser](https://github.com/filebrowser/filebrowser)好看的ui来浏览文件，同时具备服务器管理能力。
- 安装`npm install filecat -g`然后执行 `filecat`，使用参数`filecat --help`可以获取更多参数说明。也支持**二进制**方式直接运行，更多使用方式请参考下文。
## 一. 截图
![展示](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## 二. 使用
### 1. 体验
url: http://116.198.245.137:5569/
账号密码: `admin`/`admin`暂时没有权限功能，请不要修改密码，影响别人体验
### 2. npm 方式运行
- 如果你的服务器上已经安装了node和npm，使用 `npm install filecat -g`全局安装，后然后使用`filecat`命令即可运行，或者`npm install filecat`安装到本项目下，使用`npx filecat `运行；
- 如果网络比较差，可以使用淘宝镜像源`npm config set registry https://registry.npmmirror.com`。或者，安装的时候临时使用淘宝镜像源`npm install -g filecat --registry https://registry.npmmirror.com`。
- 许多依赖是预构建放在github上的，如果主机环境访问github很慢(多尝试几下也许就好了)，需要编译，查看报错后安装诸如`npm -g install node-addon-api`的依赖。在windwos上编译可能遇到的问题可以查看这个链接 https://blog.csdn.net/jjocwc/article/details/134152602
### 3. 二进制文件方式运行
下载[最新release](https://github.com/xiaobaidadada/filecat/releases)
然后使用各个平台的可执行程序运行;（windows在系统信息中,查看处理器如果是AMD就是x64，或者就是arm，linux输入`uname -m`可以显示架构类型）；
1. 执行命令`filecat.exe --port 5567 --base_folder /home `  不设置username的话，账号密码默认是admin
2. 使用例子中的配置文件，执行命令`filecat --env ./env`；linux下也许需要执行`sudo chmod +x ./filecat-linux`获得执行权限
### 4. linux下安装到systemd后台运行
这里的安装是安装到systemd作为后台进程，默认需要使用root权限，对于Linux系统现在提供自动安装功能，推荐使用这种systemd方式运行;只需要下载最新版本的`filecat-linux`可执行程序后，给与它chod可执行权限，然后运行 `./filecat-linux --install linux`;如果你使用npm安装了filecat，可以直接使用`filecat --install linux`来安装到systemd。
### 5. docker 方式运行
使用`docker run -d --name filecat --restart=always --net=host -v /home:/home ghcr.io/xiaobaidadada/filecat:latest --port 5567 --base_folder /home`命令直接运行。

说明:
1. 所有的用于可执行的参数在这里都可用，也可以省略参数，那么参数会使用项目下的env文件。
2. 可以使用`-v`参数映射一个env配置文件给程序， `-v /home:/home`是管理文件的必要参数(使用`base_folder`参数设置)，否则能够看到的只是容器内的临时文件。
3. `--net=host`参数可以使用项目的所有关于网络的功能(虚拟网络，ddns等)，由于在容器内运行，系统基本信息有些获取不到，但是内存和cpu使用率还是可以获取到物理机的。
4. 本软件是为了管理主机的，如果只是想用文件管理功能，使用docker是可以的，否则还是建议在物理机上安装此程序。
## 三. 开发
- 目前在mac上 直接install会失败(没有测试过)，可以使用`npm install --ignore-scripts`。
- 本项目所有需要编译的依赖都使用了预构建，会从github下载编译好的文件，如果你电脑上的网络安装的时候无法访问github则会退化成编译。如果是在windows上需要编译编译可能遇到的问题可以参考这个链接https://blog.csdn.net/jjocwc/article/details/134152602
- 项目使用nodejs， web网页构建使用react,没有使用Ui框架，而是使用[filebrowser](https://github.com/filebrowser/filebrowser)项目的css,本地dev开发的时候服务端是转发webpack的服务，打包环境下是把web网页作为资源加载的，服务器的路由使用routing-controllers来处理http，使用common下的frame处理websocket（使用和socket.io解析json一样的库socket.io-parser，有一个参数`export const protocolIsProto2 = true;`可选择使用proto协议，为什么不直接使用socket.io呢，是因为当时本来采用的proto，想更多的复用一下代码），都支持修饰器用法，打包的时候前后端都会使用webpack打包。
## 四. 主要特性
-  文件管理
  1. 图片，视频，markdown 等文件格式在线预览。
  2. 代码编辑器，可选择文件打开方式。
  3. 图片编辑器，对图片右键可以进入[图片编辑器](https://github.com/scaleflex/filerobot-image-editor)模式。
  4. studio 编辑器，右键文件夹可以打开一个类似vscode的编辑器页面，可用于linux程序临时开发环境。
  5. [excalidraw](https://github.com/excalidraw/excalidraw)绘图编辑器，这是一个很好用白板工具。 
  5. 切换根目录，在设置中添加多个文件夹路径后，可以在右上角选择切换根目录，只对一个session生效。
  6. 终端，默认是bash， windwos下是 powershell。
- ssh代理,ftp代理: 可以管理多个linux服务器，作用和winscp类似，让终端和文件管理更方便。
- 网站，是网址收藏夹，可用于保存服务器上其它的网站
- ddns
- http网页代理、rdp代理(windwos远程控制)、rtsp代理播放器，输入直播源，比如监控的url可以实时网页观看
- docker容器，镜像管理，查看日志等功能
- 系统内存cpu信息，进程cpu信息（利用c插件、使用极低的资源，实时查看系统全部进程信息，类似windows的任务管理器）,systemd管理(linux下才有)
- wol网络唤醒
- 虚拟网络，可以实现p2p,vpn功能。(不是端口转发，而是利用tun在主机上创建虚拟ip)
## 五. 功能说明
1. 由于一些库目前不支持mac(比如虚拟网络) **mac下无法使用**上面的安装方式直接安装成功，在windows需要管理员模式下运行，linux需要root权限才可以使用该功能。此外还很多功能没有在macos下测试过，只支持windows和Linux;
2. 部分功能目前处于demo阶段，未来会持续优化；
## 六. 路线
1. 优化更多操作细节 
2. 支持更多的文件格式浏览
3. 支持更多的流媒体功能
4. 支持更多的ddns平台
5. 自动化爬虫
6. 路由权限
## 七. qq群
824838674
## 八. 致谢
本项目部分功能还基于或者借鉴于以下项目
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
