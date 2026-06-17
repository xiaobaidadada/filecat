<p align="center">
  <img src="../src/web/meta/resources/img/logo-70.png" alt="FileCat Logo" width="70" height="70">
</p>

<h1 align="center">FileCat</h1>

<p align="center">
  <i>A self-hosted web file server and lightweight server management tool</i>
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
  <a href="#demo">Demo</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#upgrade">Upgrade</a>
</p>

<p align="center">
  <a href="../README.md">中文文档</a>
</p>

---

FileCat is a **self-hosted web file server** and a **lightweight server management tool**. Once deployed on your server, you can browse, manage, and preview files from any browser, while also enjoying a rich set of server administration features.

> **Core Philosophy**: File management at the core, enhanced with AI Agent, remote desktop, intranet penetration, system monitoring, and more - making server management simpler than ever.

---

## Features

| Category | Capabilities |
|----------|-------------|
| File Management | Browse, upload, download, edit, and preview files (images, videos, Markdown, drawings, etc.) |
| AI Agent | Integrated LLM-powered assistant for intelligent operations (BYO API key) |
| Intranet Penetration | Expose internal services to the internet without a public IP |
| SSH Terminal | Built-in web terminal for direct server access |
| Windows Remote Desktop | Access Windows remote desktops directly in your browser (RDP) |
| System Dashboard | Real-time CPU, memory, disk, and network monitoring |
| CI/CD Workflow | Custom command pipelines for continuous integration and deployment |
| Large Log Viewer | Instantly open text log files of any size |
| Excalidraw Drawing | Built-in collaborative whiteboard |
| Image Editor | Online crop, annotate, and adjust images |
| Multi-user Management | Granular permission control |
| Shareable Links | Generate share links for easy file sharing |
| Multi-path Mounting | Mount multiple file system paths |

---

## Screenshots

<table>
  <tr>
    <td align="center"><b>File List</b></td>
    <td align="center"><b>AI Agent</b></td>
  </tr>
  <tr>
    <td><img src="./文件列表.png" alt="File List"/></td>
    <td><img src="./AI能力.png" alt="AI Agent"/></td>
  </tr>
  <tr>
    <td align="center"><b>Intranet Penetration</b></td>
    <td align="center"><b>System Dashboard</b></td>
  </tr>
  <tr>
    <td><img src="./内网穿透.png" alt="Intranet Penetration"/></td>
    <td><img src="./系统信息看板.png" alt="System Dashboard"/></td>
  </tr>
</table>

---

## Demo

Try it online: **[http://demo.filecat.xiaobaidadada.fun/](http://demo.filecat.xiaobaidadada.fun/)**

| Account Type | Username | Password |
|-------------|----------|----------|
| English     | `demo`   | `demo`   |
| Chinese     | `demo-zh`| `demo`   |

> Demo server is sponsored by [Yecao Cloud](https://my.yecaoyun.com/aff.php?aff=7185)

---

## Installation

> Minor bug fixes and feature updates are published to npm in real time.

### 1. NPM (Recommended)

```bash
npm install -g filecat
```

For Linux systems, use `pm2` to keep it alive, or run `filecat --install` to register it with systemd.

### 2. Linux One-Click Script

```bash
curl -o install.sh https://filecat.xiaobaidadada.fun/files/linux-install.sh && bash install.sh
```

Automatically downloads the binary and runs the installer. Follow the prompts to configure.

### 3. Binary Package

Download the latest version from [Releases](https://github.com/xiaobaidadada/filecat/releases).

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

**Option 1** - After NPM installation:
```bash
filecat --port 5567
```

**Option 2** - Extract the binary package and run the script inside:
- Linux/Mac: `filecat-run.sh`
- Windows: `filecat-run.cmd`

**Default credentials**: `admin` / `admin`

> Use `filecat --help` to see all available options.

> **Important**: After installation, the default accessible directory is the installation directory. Please configure user access permissions in the settings.

---

## Upgrade

1. **Regular Upgrade**: Based on your installation method
   - NPM: `npm -g i filecat`
   - Docker: Pull the latest image
   - Binary: Download the latest package and replace
2. **Auto Upgrade** (v5.33.0+): Run `filecat-upgrade` to automatically upgrade based on your installation environment. Docker and binary installations also support custom download URL parameters.

---

## Community

Join our QQ Group: **824838674**

---

## Contributing

1. Submit PRs to the `dev` branch
2. For feature contributions, please discuss in the QQ group first

---

## Credits

FileCat is inspired by or built upon these great projects:

- [filebrowser](https://github.com/filebrowser/filebrowser) - Excellent file browsing implementation
- [MeshCentral](https://github.com/Ylianst/MeshCentral) - Remote management insights
- [mstsc](https://github.com/citronneur/mstsc.js) - Web RDP foundation

---

<p align="center">
  <a href="https://github.com/xiaobaidadada/filecat">
    <img src="https://img.shields.io/github/stars/xiaobaidadada/filecat?style=social" alt="Star on GitHub">
  </a>
</p>

<p align="center">
  Made with love by <a href="https://github.com/xiaobaidadada">xiaobaidadada</a>
</p>
