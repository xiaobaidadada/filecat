<p align="center">
  <img src="./src/web/meta/resources/img/logo-70.png" alt="FileCat Logo" width="70" height="70">
</p>

<h1 align="center">FileCat</h1>

<p align="center">
  <i>一款功能强大的自部署 Web 文件服务器 & 轻量级服务器管理工具</i>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/filecat">
    <img src="https://img.shields.io/npm/dm/filecat.svg" alt="npm downloads">
  </a>
  <a href="https://www.npmjs.com/package/filecat">
    <img src="https://img.shields.io/npm/v/filecat.svg" alt="npm version">
  </a>
  <a href="https://github.com/xiaobaidadada/filecat">
    <img src="https://img.shields.io/github/stars/xiaobaidadada/filecat.svg" alt="stars">
  </a>
  <a href="https://ghcr.io/xiaobaidadada/filecat">
    <img src="https://img.shields.io/badge/docker-ghcr.io-blue.svg" alt="docker">
  </a>
  <a href="https://github.com/xiaobaidadada/filecat/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/xiaobaidadada/filecat.svg" alt="license">
  </a>
</p>

<p align="center">
  <a href="#-功能特性">功能特性</a> •
  <a href="#-功能截图">功能截图</a> •
  <a href="#-安装方式">安装方式</a> •
  <a href="#-快速运行">快速运行</a> •
  <a href="#-升级指南">升级指南</a> •
  <a href="#-软件对比">软件对比</a>
</p>

<p align="center">
  <a href="./doc/EN_README.md">🌍 English</a>
</p>

---

FileCat 是一个需要自己部署的 Web 文件服务器，同时也是一款**轻量级服务器管理工具**。部署后，你可以随时随地通过浏览器管理服务器上的文件，并享受丰富的运维功能。

>  **核心理念**：以文件管理为核心，融合 AI Agent、远程桌面、内网穿透、系统监控等能力，让你的服务器管理变得更简单。

---

##  功能特性

| 类别 | 功能 |
|------|------|
|  **文件管理** | 浏览、上传、下载、编辑、在线预览（图片、视频、Markdown、绘图等） |
|  **AI Agent** | 集成大语言模型，智能辅助运维和文件处理（需自行配置 API） |
|  **内网穿透** | 无需公网 IP，即可将内网服务暴露到外网 |
| ️ **SSH 终端** | 浏览器内置 Web 终端，随时连接服务器 |
|  **Windows 远程桌面** | 浏览器中直接操作远程 Windows 桌面（RDP） |
|  **系统信息看板** | 实时 CPU、内存、磁盘、网络等系统监控 |
|  **CI/CD 工作流** | 支持自定义命令流水线，实现持续集成与部署 |
|  **超大日志查看** | 任意大小的文本日志文件秒开，高效定位问题 |
|  **Excalidraw 绘图** | 内置白板绘图工具，支持团队协作 |
| ️ **图片简单编辑** | 在线裁剪、标注、调整图片 |
|  **多用户管理** | 完善的权限体系 |
|  **可分享链接** | 生成文件分享链接，方便他人下载 |
|  **多路径挂载** | 支持挂载多个文件系统路径 |

---

##  功能截图

<table>
  <tr>
    <td align="center"><b> 文件列表</b></td>
    <td align="center"><b> AI Agent 能力</b></td>
  </tr>
  <tr>
    <td><img src="./doc/文件列表.png" alt="文件列表"/></td>
    <td><img src="./doc/AI能力.png" alt="AI Agent 能力"/></td>
  </tr>
  <tr>
    <td align="center"><b> 内网穿透</b></td>
    <td align="center"><b> 系统信息看板</b></td>
  </tr>
  <tr>
    <td><img src="./doc/内网穿透.png" alt="内网穿透"/></td>
    <td><img src="./doc/系统信息看板.png" alt="系统信息看板"/></td>
  </tr>
</table>

---

##  Demo

在线体验地址：**[http://demo.filecat.xiaobaidadada.fun/](http://demo.filecat.xiaobaidadada.fun/)**

| 账号类型 | 用户名 | 密码 |
|---------|--------|------|
| English | `demo` | `demo` |
| 中文    | `demo-zh` | `demo` |

>  Demo 服务器由 [野草云](https://my.yecaoyun.com/aff.php?aff=7185) 赞助提供

---

##  安装方式

> 小版本 bug 修复与功能更新仅在 npm 上实时发布同步。

### 1️⃣ NPM 安装（推荐）

```bash
npm install -g filecat
```

对于 Linux 系统，安装后可以选择使用 `pm2` 保活，或执行 `filecat --install` 注册到 systemd。

### 2️⃣ Linux 一键脚本

```bash
curl -o install.sh https://filecat.xiaobaidadada.fun/files/linux-install.sh && bash install.sh
```

自动下载二进制包并执行安装，按提示输入参数即可。

### 3️⃣ 二进制包

从 [Releases](https://github.com/xiaobaidadada/filecat/releases) 下载对应系统的最新版本。

### 4️⃣ Docker

```bash
docker run -d --name filecat --restart=always --net=host \
  -v /home:/home \
  ghcr.io/xiaobaidadada/filecat:latest \
  --port 5567 --base_folder /home
```

### 5️⃣ 源码编译

```bash
git clone https://github.com/xiaobaidadada/filecat.git
cd filecat
npm install
npm run dev        # 开发模式
# 或
npm run build && node build/main.js  # 生产模式
```

---

##  快速运行

**方式一**：NPM 安装后执行：
```bash
filecat --port 5567
```

**方式二**：二进制包解压后，目录内有 `filecat-run.sh`（Linux/Mac）或 `filecat-run.cmd`（Windows）运行脚本。

**默认账号/密码**：`admin` / `admin`

>  更多参数请使用 `filecat --help` 查看。

> ️ **权限提示**：安装后默认能访问的文件目录是安装目录，请在设置中为每个用户配置可访问目录及执行权限。

---

##  升级指南

1. **常规升级**：根据你的安装方式升级
   - NPM：`npm -g i filecat`
   - Docker：重新 pull 最新镜像
   - 二进制：下载最新包替换
2. **自动升级**（v5.33.0+）：执行 `filecat-upgrade` 命令，自动根据安装环境升级。Docker 和二进制安装还支持自定义下载 URL 参数。

---

##  社区交流

加入 QQ 群 **824838674** 进行交流反馈

---



##  参与开发

1. PR 请先提交到 `dev` 分支
2. 功能性提交请在 QQ 群中提前沟通

---

##  感谢

以下项目为 FileCat 提供了灵感或基础：

- [filebrowser](https://github.com/filebrowser/filebrowser) - 文件浏览器的优秀实践
- [MeshCentral](https://github.com/Ylianst/MeshCentral) - 远程管理的启发
- [mstsc](https://github.com/citronneur/mstsc.js) - Web RDP 的基础支持

---

<p align="center">
  <a href="https://github.com/xiaobaidadada/filecat">
    <img src="https://img.shields.io/github/stars/xiaobaidadada/filecat?style=social" alt="Star on GitHub">
  </a>
</p>

<p align="center">
  Made with ❤️ by <a href="https://github.com/xiaobaidadada">xiaobaidadada</a>
</p>
