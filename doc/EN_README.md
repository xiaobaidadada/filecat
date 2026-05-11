# ![](./src/web/meta/resources/img/logo-70.png) FileCat

<p align="left">
  <!-- npm downloads -->
  <a href="https://www.npmjs.com/package/filecat">
    <img src="https://img.shields.io/npm/dm/filecat.svg" alt="npm downloads">
  </a>

  <!-- npm version -->

  <a href="https://www.npmjs.com/package/filecat">
    <img src="https://img.shields.io/npm/v/filecat.svg" alt="npm version">
  </a>

  <!-- GitHub stars -->

  <a href="https://github.com/xiaobaidadada/filecat">
    <img src="https://img.shields.io/github/stars/xiaobaidadada/filecat.svg" alt="stars">
  </a>


  <!-- Docker pulls -->

  <a href="https://ghcr.io/xiaobaidadada/filecat">
    <img src="https://img.shields.io/badge/docker-ghcr.io-blue.svg" alt="docker">
  </a>

  <!-- license -->

  <a href="https://github.com/xiaobaidadada/filecat/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/xiaobaidadada/filecat.svg" alt="license">
  </a>
</p>

[中文文档](../README.md)

FileCat is a web file server and also a lightweight server management tool. After deploying it on a server, you can browse files on the server and preview multiple file formats online (images, videos, drawings, Markdown, etc.).

Based on file management, FileCat integrates many server operation and management features, allowing you to have a lightweight server management tool at the same time. These features help users access and operate files on the server more conveniently.

## Partial Feature Screenshots

### File List

![](./文件列表.png)

### Intranet Penetration

![](./内网穿透.png)

### System Information Dashboard

![](./系统信息看板.png)

### AI Features

![](./AI能力.png)

In addition to the features above, it also supports some functions that may be helpful to you, such as instantly opening text log files of any size, Windows remote desktop, simple image editing, CI/CD workflows, Excalidraw drawing, and more.

## Demo

[http://demo.filecat.xiaobaidadada.fun/](http://demo.filecat.xiaobaidadada.fun/)

username/password: demo/demo
Chinese account: demo-zh/demo

The demo server is sponsored by [Yecao Cloud](https://my.yecaoyun.com/aff.php?aff=7185)

## Installation

Small bug fixes and feature updates are only released and synchronized on npm in real time.

### 1. Npm

`npm install -g filecat`

For Linux systems, after installation, you can choose to keep it alive using pm2, or use `filecat --install` to register it to systemd.

### 2. Linux curl

`curl -o install.sh https://filecat.xiaobaidadada.fun/files/linux-install.sh && bash install.sh`

On Linux systems, you can execute this command to automatically download the binary package and run the installer. Just follow the prompts to enter parameters.

### 3. Binary

Download the latest [Releases](https://github.com/xiaobaidadada/filecat/releases)

### 4. Docker

`docker run -d --name filecat --restart=always --net=host -v /home:/home ghcr.io/xiaobaidadada/filecat:latest --port 5567 --base_folder /home`

### 5. Git Clone

`git clone https://github.com/xiaobaidadada/filecat.git`

`npm install`

`npm run dev` or `npm run build && node dist/main.js`

## Run

After installation, run the command:

`filecat --port 5567`

Default username/password: admin/admin

You can use `filecat --help` to view more parameters.

Usage tip: Permission management is something that must be taken seriously. After installation, the default accessible server file directory is the installation directory. You need to configure which directories and permissions each user can access in the settings.

## Upgrade

1. Upgrade using your installation method. For example, if installed with npm, use `npm -g i filecat`; for Docker, pull the latest image again; for binary installation, download and replace it again.
2. Starting from version 5.33.0, you can use the `filecat-upgrade` command to upgrade automatically according to the installation environment. For Docker and binary installation methods, the `filecat-upgrade` command also supports a custom download URL parameter (by default it downloads the latest package from GitHub).

## QQ Group

824838674

## Thanks

The following projects provided inspiration or foundations for FileCat:

* [filebrowser](https://github.com/filebrowser/filebrowser)
* [MeshCentral](https://github.com/Ylianst/MeshCentral)
* [mstsc](https://github.com/citronneur/mstsc.js)

## Software Comparison

| Software                         | ![](./src/web/meta/resources/img/logo-70.png) [FileCat](https://github.com/xiaobaidadada/filecat) | <img width="48" src="https://github.com/user-attachments/assets/c40b22c9-33da-47b7-bc4c-ce69bb5cc174" > [Quantum](https://github.com/gtsteffaniak/filebrowser) | <img width="48" src="https://raw.githubusercontent.com/filebrowser/filebrowser/master/branding/banner.png" > [Filebrowser](https://github.com/filebrowser/filebrowser) |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| File System Support              | ✅                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| Linux                            | ✅                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| Windows                          | ✅                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| Mac                              | ✅                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| Self-hosted                      | ✅                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| WebDAV Support                   | ❌                                                     | ✅                                                                                                               | ❌                                                                                                                        |
| User Login Support               | ✅                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| Terminal Shell                   | ✅                                                     | ❌                                                                                                               | ❌                                                                                                                        |
| Open Source                      | ✅                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| Single Sign-On Support           | ✅                                                     | ✅                                                                                                               | ❌                                                                                                                        |
| Shareable Web Links              | ✅                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| Text-based File Editor           | ✅                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| Detailed Documentation           | ❌                                                     | ✅                                                                                                               | ✅                                                                                                                        |
| Office File Preview              | ❌                                                     | ✅                                                                                                               | ❌                                                                                                                        |
| Indexed Search                   | ❌                                                     | ✅                                                                                                               | ❌                                                                                                                        |
| Multiple File System Path Mounts | ✅                                                     | ✅                                                                                                               | ❌                                                                                                                        |
| Intranet Penetration             | ✅                                                     | ❌                                                                                                               | ❌                                                                                                                        |
| SSH Terminal                     | ✅                                                     | ❌                                                                                                               | ❌                                                                                                                        |
| Real-time System Information     | ✅                                                     | ❌                                                                                                               | ❌                                                                                                                        |
| Windows Remote Desktop           | ✅                                                     | ❌                                                                                                               | ❌                                                                                                                        |
| Command CI/CD Workflow Support   | ✅                                                     | ❌                                                                                                               | ❌                                                                                                                        |
| Large Log File Viewer            | ✅                                                     | ❌                                                                                                               | ❌                                                                                                                        |
| AI Agent                         | ✅                                                     | ❌                                                                                                               | ❌                                                                                                                        |
