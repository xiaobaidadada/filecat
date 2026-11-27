
<p align="center">
  <img src="./src/web/meta/resources/img/logo-70.png" alt="FileCat Logo" width="70" height="70">
</p>

<h1 align="center">FileCat</h1>

<p align="center">
  <i>A self-hosted Web file server and lightweight server management tool</i>
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
  <a href="#features">Features</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a>
</p>

<p align="center">
  <a href="./CH_README.md">中文</a>
</p>

---

FileCat is a self-hosted Web file server and a **lightweight server management tool**. Once deployed, you can manage files on your server anytime and anywhere through a browser, while also enjoying a wide range of server management and operations features.

FileCat 是一个自己部署使用的轻量级web文件与工具服务器，UI设计支持移动设备访问，此项目在文件服务器的基础上，提供了很多为开发者使用的功能（内网穿透、CI/CD、大文件日志查看、系统信息查看、安全的SSH终端等)，文件访问支持多种格式的预览和编辑，并支持markdown(.md)的所见即所得编辑体验。

FileCat uses the UI of [filebrowser](https://github.com/filebrowser/filebrowser).

> **Core philosophy**: Centered around file management, FileCat integrates AI Agent, remote desktop, intranet tunneling, system monitoring, and other capabilities to make server management simpler.

---

## Features

| Category | Features |
|------|------|
| File Management | Browse, upload, download, rename, move, copy, compress and extract; drag-and-drop upload and paged infinite scrolling |
| File Preview | Online preview for images, video, audio, PDF, Office documents, Markdown, source code, logs and more |
| Office Editor | Edit Word (docx), Excel (xlsx) and PowerPoint (pptx) right in the browser — no local Office installation required |
| Markdown WYSIWYG | Typora-like live-preview editing with 7 built-in themes, Mermaid / SVG diagrams and KaTeX formulas |
| Code Editor | Built-in Ace editor with syntax highlighting, multi-language detection and a split-pane Studio mode |
| Large Log Viewer | Instantly open log files of any size, with virtual scrolling, live tail and keyword highlighting |
| Deep Search | Recursively search file names or contents, with regex, case-insensitive and exclusion filters; open it via the magnifier icon left of the search box |
| Cloud Storage Mount | Mount Baidu Netdisk / SSH(SFTP) / S3 / WebDAV / SMB as local folders, managed with the same file operations |
| File Server | The reverse direction: expose local folders over SMB / WebDAV / SFTP, accessible from Windows Explorer and any standard client |
| Intranet Tunneling | Expose internal services to the public internet, or connect multiple internal networks; with multi-machine deployment it enables cross-machine file sync and CI/CD automation |
| SSH Terminal | Built-in Web terminal for connecting to servers anytime, including mounted SSH hosts |
| Windows Remote Desktop | Operate remote Windows desktops (RDP) directly through a browser |
| CI/CD Workflow | Custom command pipelines (.workflow.yml / .act) for continuous integration and deployment |
| System Management | System dashboard (CPU / memory / disk / network), process manager, systemd services, firewall (ufw / nftables), Docker configuration |
| Git Management | Built-in Git client with staging and committing, commit history graph, branch and remote branch management, diff view, blame, stash and tags |
| AI Agent | Integrates large language models to assist with server management and file processing (API configuration required). Supports QQ, WeCom, Feishu, DingTalk and other third-party platform bots |
| Excalidraw Drawing | Built-in whiteboard tool that edits .draw files directly |
| Multi-user Management | Comprehensive permission system with role-based, user-level permissions and directory access restrictions |
| Shareable Links | Generate share links for files or folders, with optional password and expiry |

---

## Screenshots

<table>
  <tr>
    <td align="center"><b>File List</b></td>
    <td align="center"><b>AI Agent</b></td>
  </tr>
  <tr>
    <td><img src="./doc/文件列表.png" alt="File List"/></td>
    <td><img src="./doc/AI能力.png" alt="AI Agent"/></td>
  </tr>
  <tr>
    <td align="center"><b>Intranet Tunneling</b></td>
    <td align="center"><b>System Information Dashboard</b></td>
  </tr>
  <tr>
    <td><img src="./doc/内网穿透.png" alt="Intranet Tunneling"/></td>
    <td><img src="./doc/系统信息看板.png" alt="System Information Dashboard"/></td>
  </tr>
</table>

---

## Demo

Online demo: **[http://demo.filecat.xiaobaidadada.fun/](http://demo.filecat.xiaobaidadada.fun/)**

Username and password: `demo`/`demo` or `test`/`test`

> The demo server is sponsored by [Yecaoyun](https://my.yecaoyun.com/aff.php?aff=7185).

---

## Installation

> Minor bug fixes and feature updates are released and synchronized on npm in real time.

### 1. NPM Installation (Recommended)

```bash
npm install -g filecat
```

On Linux, after installation, you can use `pm2` to keep the process running, or register FileCat as a systemd service for process management.

### 2. One-click Linux Installation Script

```bash
curl -o install.sh https://filecat.xiaobaidadada.fun/files/linux-install.sh && bash install.sh
```

The script automatically downloads the binary package and performs the installation. Simply follow the prompts to enter the required parameters.

### 3. Binary Package

Download the latest version for your operating system from [Releases](https://github.com/xiaobaidadada/filecat/releases).

### 4. Docker

```bash
docker run -d --name filecat --restart=always --net=host \
  -v /home:/home \
  ghcr.io/xiaobaidadada/filecat:latest \
  --port 5567 --base_folder /home
```

### 5. Build from Source

```bash
git clone https://github.com/xiaobaidadada/filecat.git
cd filecat
npm install
npm run dev        # Development mode
# or
npm run build && node build/main.js  # Production mode
```

---

## Quick Start

**Method 1**: After installing via NPM:

```bash
filecat --port 5567
```

**Method 2**: After extracting the binary package, run the `filecat-run.sh` script (Linux/Mac) or `filecat-run.cmd` script (Windows) included in the directory.

**Default username/password**: `admin` / `admin`

> For more options, run `filecat --help`.

> **Permission Notice**: By default, FileCat can only access the installation directory after installation. Configure the directories and execution permissions accessible to each user in the settings.

---

## Community

Join the QQ group **824838674** for discussion, feedback, and support.
