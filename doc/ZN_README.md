# ![](./src/web/meta/resources/img/logo-70.png) filecat

- 中文 | [English ](./doc/EN_README.md)
- 中文 | [Português ](./doc/PT_README.md)
- Use uma interface bonita baseada no [filebrowser](https://github.com/filebrowser/filebrowser) para gerenciar arquivos, com funcionalidades adicionais de administração de servidores.
- Instale com `npm install filecat -g` e execute `filecat`. Utilize o parâmetro `filecat --help` para obter mais informações sobre os parâmetros disponíveis. Também é possível rodar diretamente via binário; veja mais detalhes abaixo.

## Capturas de Tela
![Demonstração](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## Uso
### Testar
URL: http://116.198.245.137:5569/  
Credenciais: `admin` / `admin`  
*Nota*: Atualmente não há controle de permissões, então não altere a senha para não prejudicar outros usuários.

### Executar com npm
- Caso sua máquina tenha o Node.js e o npm instalados, você pode usar `npm install filecat -g` para instalar globalmente e rodar com o comando `filecat`. Alternativamente, instale localmente no projeto com `npm install filecat` e execute com `npx filecat`.
- Se a conexão for lenta, utilize o espelho da Taobao com `npm config set registry https://registry.npmmirror.com`, ou configure-o temporariamente durante a instalação: `npm install -g filecat --registry https://registry.npmmirror.com`.

### Executar como binário
Os códigos mais recentes não são distribuídos diretamente em pacotes. Caso precise de novas funcionalidades ou correções de bugs, será necessário compilar manualmente.  
1. Baixe a [última versão](https://github.com/xiaobaidadada/filecat/releases).  
2. Execute o arquivo correspondente à sua plataforma (x64) com um comando como:  

1. `filecat --port 5567 --base_folder d:/ `  *Nota*: Se você não definir o nome de usuário, as credenciais padrão serão `admin` / `admin`.
2. 使用例子中的配置文件，执行命令`filecat --env ./env`；linux下也许需要执行`sudo chmod +x ./filecat-linux`获得执行权限
3. 如果不能运行请自己在对应环境下进行打包编译或者使用不打包方式运行(网络功能暂时不支持多环境)
### linux下安装到systemd后台运行
这里的安装是安装到systemd作为后台进程，默认需要使用root权限，对于Linux系统现在提供自动安装功能，推荐使用这种systemd方式运行;只需要下载最新版本的`filecat-linux`可执行程序后，给与它chod可执行权限，然后运行 `./filecat-linux --install linux`;如果你使用npm安装了filecat，可以直接使用`filecat --install linux`来安装到systemd。
### 开发
- 目前在mac上 直接install会失败(没有测试过)，可以使用`npm install --ignore-scripts`。
- 本项目所有需要编译的依赖都使用了预构建，会从github下载编译好的文件，如果你电脑上的网络安装的时候无法访问github则会退化成编译。如果是在windows上需要编译编译可能遇到的问题可以参考这个链接https://blog.csdn.net/jjocwc/article/details/134152602
## 主要特性
-  文件管理
  1. 图片，视频，markdown 等文件格式在线预览。
  2. 代码编辑器，可选择文件打开方式。
  3. 图片编辑器，对图片右键可以进入[图片编辑器](https://github.com/scaleflex/filerobot-image-editor)模式。
  4. studio 编辑器，右键文件夹可以打开一个类似vscode的编辑器页面，可用于linux程序临时开发环境。
  5. [excalidraw](https://github.com/excalidraw/excalidraw)绘图编辑器，这是一个很好用白板工具。 
  5. 切换根目录，在设置中添加多个文件夹路径后，可以在右上角选择切换根目录，只对一个session生效。
  6. 终端，可以实时跟着目录走。
- ssh代理,ftp代理: 可以管理多个linux服务器，作用和winscp类似，让终端和文件管理更方便。
- 网站，是网址收藏夹，可用于保存服务器上其它的网站
- ddns
- http网页代理
- rdp代理(windwos远程控制)
- rtsp代理播放器，输入直播源，比如监控的url可以实时网页观看
- docker容器，镜像管理，查看日志等功能
- 系统内存cpu信息，进程cpu信息（利用c插件、使用极低的资源，实时查看系统全部进程信息，类似windows的任务管理器）,systemd管理(linux下才有)
- wol网络唤醒
- 虚拟网络，可以实现p2p,vpn功能。(不是端口转发，而是利用tun在主机上创建虚拟ip)
## 功能说明
1. 由于一些库目前不支持mac(比如虚拟网络) **mac下无法使用**上面的安装方式直接安装成功，在windows需要管理员模式下运行，linux需要root权限才可以使用该功能。此外还很多功能没有在macos下测试过，只支持windows和Linux;
2. 部分功能目前处于demo阶段，未来会持续优化；
## 路线
1. 优化更多操作细节 
2. 支持更多的文件格式浏览
3. 支持更多的流媒体功能
4. 支持更多的ddns平台
5. 自动化爬虫
6. 路由权限
## 致谢
本项目部分功能还基于或者借鉴于以下项目
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
