Here's the English translation of the `filecat` README:

---

# ![](./src/web/meta/resources/img/logo-70.png) filecat

- 中文 | [English](./doc/EN_README.md)
- FileCat helps developers manage their Linux servers and provides nearly all the essential tools related to development. Features include a remote terminal with permissions (supporting RDP desktop and command interception), SSH proxy, online file browsing, editing, decompression, whiteboard drawing, automation build, system monitoring, Docker management, real-time log viewing for large files, and more (currently supports Linux and Windows but not macOS).
- It is a service program accessible via the web. You can globally install it with the npm command `npm install filecat -g`, then run it with the `filecat` command. Use `filecat --help` for more information on parameters. It also supports **binary** execution, and more usage and parameters are explained below.

## 1. Screenshot
![Showcase](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## 2. Usage
### 1. Experience
URL: [http://116.198.245.137:5569/](http://116.198.245.137:5569/)  
Username and password: `admin` / `admin`

### 2. Run via npm
- If Node.js and npm are already installed on your server, use `npm install filecat -g` for global installation and run the program with the `filecat` command. Alternatively, you can install it locally with `npm install filecat` and use `npx filecat` to run it.
- For slower network speeds, you can use the Taobao mirror with the command: `npm config set registry https://registry.npmmirror.com`. Or install using the Taobao mirror temporarily: `npm install -g filecat --registry https://registry.npmmirror.com`.
- Some dependencies are pre-built on GitHub (supporting Node versions 16, 18, 20, 22). If accessing GitHub is slow, you may need to compile them manually. After seeing errors, you might need to install dependencies like `npm -g install node-addon-api`. If GitHub is completely inaccessible, you can use the binary or Docker method. For Windows compilation issues, you can check this link: [CSDN Blog](https://blog.csdn.net/jjocwc/article/details/134152602).

### 3. Run via Binary
Download the [latest release](https://github.com/xiaobaidadada/filecat/releases) and run the executable program for your platform (check your CPU architecture in system info, for example, if you're on Windows, an AMD processor is x64, or use `uname -m` on Linux to check the architecture).
1. Execute the command: `filecat.exe --port 5567 --base_folder /home`. If no username is set, the default username and password are both `admin`.
2. Use the example configuration file by running: `filecat --env ./env`. On Linux, you may need to give executable permissions: `sudo chmod +x ./filecat-linux`.

### 4. Install on systemd (Linux)
This method installs FileCat as a background process under systemd, which requires root privileges. The automatic installation option is available for Linux systems. It's recommended to use this method. Simply download the latest `filecat-linux` executable, grant executable permissions, and run `./filecat-linux --install linux`. Alternatively, if you installed FileCat via npm, you can use `filecat --install linux` to install it on systemd.

### 5. Run via Docker
Run with the following command:  
`docker run -d --name filecat --restart=always --net=host -v /home:/home ghcr.io/xiaobaidadada/filecat:latest --port 5567 --base_folder /home`.

**Explanation:**
1. All executable parameters are available here. If no parameters are passed, the program will use the configuration from the `env` file.
2. You can mount an `env` configuration file using the `-v` option, e.g., `-v /home:/home` is necessary for managing files (set by the `base_folder` parameter); otherwise, only temporary container files are visible.
3. Use the `--net=host` option to enable network-related features like virtual networks and DDNS. Although some system information cannot be obtained in a container, memory and CPU usage will still reflect the physical machine.
4. If you only need file management functionality, using Docker is fine, but for other features, it's better to run it on a physical machine.

## 3. Key Features
- **File Management:**
  1. Online preview of image, video, markdown, and other formats.
  2. Code editor with selectable file open methods.
  3. Image editor (right-click an image to enter [Filerobot Image Editor](https://github.com/scaleflex/filerobot-image-editor)).
  4. Studio editor: right-click a folder to open an editor similar to VS Code for temporary Linux development environments.
  5. [Excalidraw](https://github.com/excalidraw/excalidraw) whiteboard drawing editor, a useful tool for drawing and brainstorming.
  6. Switch root directory: after adding multiple folder paths in the settings, you can switch root directories in the top right corner (only for the current session).
  7. Terminal: Custom terminal to filter any command to prevent harmful commands like `rm -rf /`. For software like Node that requires interaction, you need to add `-i` or provide custom handling functions.
  8. Real-time log viewer: Right-click on any large text file to view it as a log file, with the ability to scroll quickly through it and output real-time content.
  9. Workflow: Similar to GitHub Actions or Jenkins, a local automation build tool. Right-click a file to run it, or manually input a `.workflow.yml` file (requires appropriate permissions).

- **SSH and FTP Proxy:** Manage multiple Linux servers, similar to WinSCP, for more convenient terminal and file management.
- **HTTP Proxy:** Similar to Postman, allows sending HTTP requests.
- **Websites:** A bookmark feature to store other server URLs.
- **DDNS, HTTP Web Proxy, RDP Proxy (Windows remote control), RTSP Proxy Player:** Allows real-time viewing of streaming sources such as surveillance camera URLs.
- **Docker Container Management:** Manage Docker containers and images, view logs, etc.
- **System Info:** View system memory, CPU usage, and per-process CPU information (using low resources for real-time monitoring, similar to Windows Task Manager). Includes systemd management (only on Linux).
- **Wake-on-LAN (WOL):** Network wake-up feature.
- **Virtual Network:** Provides P2P and VPN functionality (not port forwarding, but using TUN to create a virtual IP on the host).
- **Permissions:** Supports various system permissions for file operations and commands.

## 4. Additional Notes
1. Due to some libraries not supporting macOS (e.g., virtual networks), **macOS cannot directly install** FileCat. On Windows, it requires administrator mode, and on Linux, root permissions are necessary for certain features. Additionally, many features haven't been tested on macOS, so only Windows and Linux are supported.
2. Some features are still in demo stage and will be continuously optimized.

## 5. Roadmap
1. Optimize more operational details.
2. Support additional file formats for browsing.
3. Add more streaming features.
4. Support additional DDNS platforms.
5. Automate web crawling.
6. Mobile support.

## 6. QQ Group
824838674

## 7. Acknowledgments
This project is based on or inspired by the following projects:
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)

--- 

Let me know if you need more details or help with anything!