Here’s the English translation of your document:

---

# ![](./src/web/meta/resources/img/logo-70.png) filecat

- [中文](./doc/README.md) | English
- FileCat helps developers set up a file server with numerous essential features tailored for programmers. It includes remote terminals with permissions (supports RDP desktop, terminal command interception), SSH proxy, online file browsing/editing/extraction, whiteboard drawing, automated builds, system monitoring, Docker management, real-time viewing of large logs, and more. Currently, it supports Linux and Windows but does not support macOS.
- It is a service program accessed via a web interface. Install it globally using `npm install filecat -g`, then run it with the `filecat` command. Use `filecat --help` for more options. It also supports **binary execution**. See the details below for more usage instructions.

## 1. Screenshots
![Demo](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## 2. Usage

### 1. Demo
URL: [http://116.198.245.137:5569/](http://116.198.245.137:5569/)

- **account:** `en_admin` / `en_admin`

### 2. Running with npm
- If Node.js and npm are already installed, install FileCat globally using `npm install filecat -g`, then run `filecat`. Alternatively, install it locally with `npm install filecat` and run it with `npx filecat`.
- If your network is slow, use the Taobao mirror:
  - Set it permanently: `npm config set registry https://registry.npmmirror.com`
  - Use it temporarily during installation: `npm install -g filecat --registry https://registry.npmmirror.com`
- Many dependencies are prebuilt and hosted on GitHub (supports Node.js 16, 18, 20, 22). If GitHub access is slow, installation may fail and require local compilation. If this happens, check the error logs and install dependencies such as `npm -g install node-addon-api`. If GitHub access is blocked, consider using the binary or Docker versions.
- On Windows, local compilation may require additional setup. See [this link](https://blog.csdn.net/jjocwc/article/details/134152602).

### 3. Running with binary files
Download the [latest release](https://github.com/xiaobaidadada/filecat/releases) and extract the package for your platform. The package includes all necessary resources and a `node.exe` file. Use the provided `run` script to start the program. Currently, only x64 architecture is supported; ARM users must compile it themselves.

1. Run the following command:
  - Windows: `run.cmd --port 5567 --base_folder /home`
  - Linux: `run.sh --port 5567 --base_folder /home` (you may need to run `chmod +x ./run.sh` to grant execute permission)
2. Use a configuration file:
  - Run: `run.sh --env ./env`

If no username is specified, the default account credentials are `admin` / `admin`.

### 4. Running as a systemd service on Linux
To install FileCat as a systemd service (requires root permissions):
1. Download the latest `filecat-linux` executable.
2. Grant execute permissions: `chmod +x filecat-linux`.
3. Install it as a systemd service: `./filecat-linux --install linux`.
4. If installed via npm, run `filecat --install linux`.

### 5. Running with Docker
Run the following command:
```sh
docker run -d --name filecat --restart=always --net=host -v /home:/home ghcr.io/xiaobaidadada/filecat:latest --port 5567 --base_folder /home
```  
- All executable parameters can be used as Docker arguments. If omitted, default values from the `env` file will be used.
- Use `-v` to mount a configuration file and directories (e.g., `-v /home:/home` is necessary for file management).
- `--net=host` enables full network features such as virtual networking and DDNS. However, some system info may be inaccessible in Docker.
- If you only need file management, Docker is sufficient. For full functionality, install FileCat on a physical machine.

## 3. Key Features

### File Management
1. Online previews for images, videos, Markdown, and more.
2. Code editor with customizable file-opening options.
3. Image editor with [Filerobot Image Editor](https://github.com/scaleflex/filerobot-image-editor).
4. Studio editor: Right-click a folder to open a VS Code-like editor, useful for temporary Linux development.
5. [Excalidraw](https://github.com/excalidraw/excalidraw) whiteboard drawing tool.
6. Root directory switching: Set multiple root folders in settings and switch sessions dynamically.
7. Custom terminal with command filtering to prevent malicious execution (e.g., blocking `rm -rf /`).
8. Large log file viewer with real-time updates and fast scrolling.
9. Workflow automation: A local automation tool similar to GitHub Actions or Jenkins. Create `.workflow.yml` files to automate tasks.
10. Resumable and parallel file uploads.

### Additional Features
- **SSH & FTP Proxy**: Manage multiple Linux servers, similar to WinSCP.
- **HTTP Proxy**: A built-in HTTP client similar to Postman; can also be used for server-side file downloads.
- **Website Manager**: A bookmark manager for accessing server-based websites.
- **DDNS**: Dynamic DNS updates.
- **Web-based HTTP Proxy, RDP Proxy, and RTSP Player**: Watch live streams (e.g., security cameras) in a browser.
- **Docker Management**: Manage containers, images, and logs.
- **System Monitoring**: View memory, CPU usage, and process statistics with minimal resource consumption.
- **WOL (Wake-on-LAN)**: Remotely power on machines.
- **Virtual Networking**: Create peer-to-peer VPNs with `tun` interfaces.
- **User Permissions**: Granular control over file operations, commands, and system features.

## 4. Additional Notes
1. **macOS is not supported** due to missing dependencies like virtual networking. Administrator privileges are required on Windows and root access on Linux for full functionality.
2. Some features are still in the demo stage and will be improved over time.
3. Developers interested in contributing should be familiar with TypeScript, React, Webpack, and Node.js APIs.
  - All non-dev dependencies are custom-built or forked, primarily implemented in C++.
  - During installation, binaries are downloaded from GitHub. If access is slow, it falls back to local compilation, which may require additional setup.
  - Ubuntu systems generally only need Python for compilation, while Windows requires Visual Studio and Python.

## 5. Roadmap
1. Improve UI/UX and add more refined operations.
2. Support additional file formats for previewing.
3. Enhance streaming capabilities.
4. Expand DDNS support.
5. Implement web scraping automation.
6. Improve virtual networking and distributed file synchronization.

## 6. Community
Join our QQ group: **824838674**

## 7. Acknowledgments
This project is inspired by or incorporates features from:
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)

---

Let me know if you need any refinements! 🚀