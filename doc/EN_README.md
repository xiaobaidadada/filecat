# ![](./src/web/meta/resources/img/logo-70.png) filecat

- 中文 | [English](./doc/EN_README.md)
- Use the beautiful UI of [filebrowser](https://github.com/filebrowser/filebrowser) to browse files, while also providing server management capabilities.
- Install with `npm install filecat -g` and then run `filecat`. Use the parameter `filecat --help` to get more parameter details. It also supports running directly in **binary** mode. For more usage details, refer to the following.

## 1. Screenshot
![展示](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## 2. Usage
### 1. Try it out
URL: [http://116.198.245.137:5569/](http://116.198.245.137:5569/)  
Username and password: `admin`/`admin` (Currently, there are no permission features, please do not change the password as it may affect others' experience)

### 2. Running with npm
- If Node.js and npm are already installed on your server, use `npm install filecat -g` to install globally, then run the `filecat` command. Alternatively, you can install with `npm install filecat` in the current project and run it with `npx filecat`.
- If the network is poor, you can use the Taobao mirror registry by running `npm config set registry https://registry.npmmirror.com`. Alternatively, you can use the Taobao mirror registry temporarily during installation with `npm install -g filecat --registry https://registry.npmmirror.com`.
- Many dependencies are pre-built and hosted on GitHub. If the host environment has slow access to GitHub, you may need to compile them. After checking the error messages, install dependencies like `npm -g install node-addon-api`. If you encounter issues compiling on Windows, check this link: https://blog.csdn.net/jjocwc/article/details/134152602

### 3. Running with Binary Files
Download the [latest release](https://github.com/xiaobaidadada/filecat/releases)  
Then use the executable for your platform to run it. (On Windows, if the processor is AMD, it's either x64 or ARM. On Linux, use the `uname -m` command to check architecture.)
1. Run the command `filecat.exe --port 5567 --base_folder /home`. If no username is set, the default username and password are `admin`.
2. Use the configuration file provided in the example and run the command `filecat --env ./env`. On Linux, you may need to run `sudo chmod +x ./filecat-linux` to give execute permissions.

### 4. Installing and Running on Linux with systemd
This installation method is for installing `filecat` as a background process under systemd, and by default, root privileges are required. For Linux systems, an automatic installation function is provided, and it's recommended to use this systemd method.  
Simply download the latest version of the `filecat-linux` executable, give it execute permissions, and run `./filecat-linux --install linux`. If you installed `filecat` with npm, you can directly use `filecat --install linux` to install it to systemd.

### 5. Running with Docker
Use the command `docker run -d --name filecat --restart=always --net=host -v /home:/home ghcr.io/xiaobaidadada/filecat:latest --port 5567 --base_folder /home` to run it directly.

**Notes:**
1. All executable parameters are available here, and you can omit parameters, in which case the parameters from the project's env file will be used.
2. You can use the `-v` parameter to map an env configuration file to the program. `-v /home:/home` is necessary to manage files (set via the `base_folder` parameter). Otherwise, only temporary files inside the container will be visible.
3. The `--net=host` parameter allows you to use all network-related functions of the project (virtual networks, ddns, etc.). Due to running in a container, some system information may be unavailable, but memory and CPU usage can still be accessed from the physical machine.
4. This software is intended for host management. If you only want to use the file management functionality, Docker can be used. Otherwise, it is recommended to install the program on the physical machine.

## 3. Development
- Currently, direct installation on macOS may fail (not tested). You can try using `npm install --ignore-scripts`.
- All dependencies that require compilation in this project use pre-built binaries, which will be downloaded from GitHub. If your computer's network cannot access GitHub during installation, it will fall back to compilation. If you need to compile on Windows, you can refer to this link: https://blog.csdn.net/jjocwc/article/details/134152602

## 4. Main Features
- File Management:
    1. Online preview for image, video, markdown, and other file formats.
    2. Code editor with the option to choose file opening methods.
    3. Image editor – right-click on an image to enter [Image Editor](https://github.com/scaleflex/filerobot-image-editor) mode.
    4. Studio editor – right-click a folder to open a VS Code-like editor page, suitable for temporary development environments for Linux programs.
    5. [Excalidraw](https://github.com/excalidraw/excalidraw) drawing editor – a great whiteboard tool.
    6. Switch root directories – after adding multiple folder paths in settings, you can select to switch root directories at the top-right corner, which only affects one session.
    7. Terminal – default is bash, Windows uses PowerShell.
- SSH Proxy, FTP Proxy: Manage multiple Linux servers, similar to WinSCP, making terminal and file management more convenient.
- Website: A bookmark manager for storing other websites hosted on the server.
- DDNS
- HTTP Web Proxy, RDP Proxy (Windows Remote Control), RTSP Proxy Player – input live stream sources, such as monitoring URLs, to watch in real-time via the web.
- Docker container and image management, log viewing, etc.
- System memory and CPU information, process CPU information (using C plugins with minimal resource usage, allowing real-time monitoring of all system processes, similar to Windows Task Manager), systemd management (only available on Linux).
- WOL (Wake-on-LAN)
- Virtual Network: Supports P2P, VPN functionality (not port forwarding, but creates a virtual IP on the host using TUN).

## 5. Feature Notes
1. Some libraries currently do not support macOS (such as virtual networks). **Cannot use** the installation method described above on macOS. On Windows, administrator mode is required; on Linux, root privileges are needed to use this feature. Additionally, many features have not been tested on macOS and are only supported on Windows and Linux.
2. Some features are still in the demo phase and will continue to be optimized in the future.

## 6. Roadmap
1. Optimize more operation details.
2. Support browsing more file formats.
3. Support more streaming media features.
4. Support more DDNS platforms.
5. Automate web crawling.
6. Route permissions.

## 7. Acknowledgments
Some features of this project are based on or inspired by the following projects:
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
