# ![](./src/web/meta/resources/img/logo-70.png) FileCat


FileCat is a server management tool centered around file management. After configuring the server file path, users can manage server files through a clean and intuitive web interface. It integrates various server management features such as command terminal, Docker management, network proxy, and more, providing a unified server management experience.

## Demo

[http://demo.filecat.xiaobaidadada.fun/](http://demo.filecat.xiaobaidadada.fun/)

username/password: demo/demo
Chinese account: demo-zh/demo

The demo server is sponsored by [Yecaoyun](https://my.yecaoyun.com/aff.php?aff=7185).

## Installation

Minor bug fixes and feature updates are released and synchronized in real time on npm.

### 1. Npm

`npm install -g filecat --registry`

Node.js 20 is recommended. Some features rely on certain npm submodules. If access to GitHub is slow, the installation process may fall back to local C++ compilation. In this case, you need Python 3.8 (not too high version) and a C++ compiler to complete the installation successfully; otherwise, some features may not function properly.

On Windows, if installation fails, it is usually because some C++ dependencies need to be compiled locally. You need to install Python 3 and [vs_BuildTools](https://aka.ms/vs/17/release/vs_BuildTools.exe) (select C++ Desktop Development and the Spectre components) before running the installation again.

### 2. Docker

`docker run -d \   --name filecat \   --restart=always \   --net=host \
  -v /home:/home \
  ghcr.io/xiaobaidadada/filecat:latest \   --port 5567 --base_folder /home`

### 3. Binary

Download the latest [Releases](https://github.com/xiaobaidadada/filecat/releases)

### 4. Git Clone

`git clone https://github.com/xiaobaidadada/filecat.git`

`npm install`

`npm run dev` or `npm run build && node dist/main.js`

## Running

Run `filecat --port 5567`

account/password: admin/admin

For more parameters, use `filecat --help`

## Features Overview

|                                    File Management                                   |                                     Code Editing                                     |                                 Multi-user Management                                |
| :----------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: |
| ![](https://github.com/user-attachments/assets/46b67603-db28-4751-b0c1-4e1ae9cef0d2) | ![](https://github.com/user-attachments/assets/aa6cf4d9-1a0f-4d47-b48d-21c509ec1554) | ![](https://github.com/user-attachments/assets/09d968e5-cd72-4aa3-8351-12ea3c0d7031) |

|                                    10G Log Viewing                                   |                                  System Information                                  |                                   TUN Client/Server                                  |
| :----------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: |
| ![](https://github.com/user-attachments/assets/20702c83-4f68-47cf-ae12-7694f19dea2a) | ![](https://github.com/user-attachments/assets/9845638c-8298-4957-86cb-201b3ca2a7d9) | ![](https://github.com/user-attachments/assets/f7a746af-5645-4241-9e2e-69eace3b4ba1) |
|                                        AI Q&A                                        |                                                                                      |                                                                                      |
| ![](https://github.com/user-attachments/assets/14c7636e-ed6a-4f4e-ac3b-64b40f66b31f) |                                                                                      |                                                                                      |

* **File Management**: Supports resumable chunked uploads, multiple root directories, code/image editing, editor mode, whiteboard drawing, file sharing...
* **Terminal**: Compared to filebrowser, it uses xterm.js and implements command permission filtering through a virtual shell to prevent users from executing dangerous commands such as `rm -r /` (therefore, command permissions must be configured in user settings before using the terminal).
* **CI/CD Automation**: Built-in automation feature that mimics GitHub workflow syntax, applied to files ending with `.act`.
* **SSH Proxy**: Can manage multiple Linux servers, similar to WinSCP, making terminal and file management more convenient. Also supports HTTP proxy, RDP remote desktop (Windows), and other proxy features.
* **Website Navigation**: Record and manage your own frequently used links.
* **System, Docker, and Process Monitoring**: For system process queries, an efficient implementation is used, requiring very low CPU usage to monitor the status of all processes.
* **AI Q&A**: Interact with AI to execute commands and obtain server resources. It also supports permission filtering to prevent AI from executing dangerous commands (therefore, before using the AI feature, you need to configure command permissions in user settings. It is recommended to set `*` to allow all commands and then explicitly forbid dangerous ones). You need to register and configure any model API compatible with the OpenAI style. It also supports local knowledge base full-text search with RAG enhancement.
* **Large Log Viewing**: Uses file chunked reading, allowing extremely large text files to open instantly.


## Thanks

The following projects provided inspiration or foundation for FileCat:

* [filebrowser](https://github.com/filebrowser/filebrowser)
* [MeshCentral](https://github.com/Ylianst/MeshCentral)
* [mstsc](https://github.com/citronneur/mstsc.js)
