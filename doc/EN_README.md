Here’s the translation of the provided document into English:

---

# ![](./src/web/meta/resources/img/logo-70.png) filecat

- 中文 | [English](./doc/EN_README.md)
- Use [filebrowser](https://github.com/filebrowser/filebrowser) with an attractive UI to browse files, and also has server management capabilities.
- Install with `npm install filecat -g` and then run `filecat`. Use the parameter `filecat --help` to get more information on available options. It also supports running via **binary** directly. For more usage details, please refer to the sections below.

## I. Screenshot
![Demo](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## II. Usage
### 1. Experience
URL: http://116.198.245.137:5569/
Username/Password: `admin`/`admin`

### 2. Running via npm
- If your server has Node.js and npm installed, use `npm install filecat -g` for global installation, then run with the `filecat` command, or use `npm install filecat` to install it in the current project and run with `npx filecat`.
- If your network connection is not stable, you can use the Taobao mirror source: `npm config set registry https://registry.npmmirror.com`. Alternatively, you can install using the mirror temporarily with `npm install -g filecat --registry https://registry.npmmirror.com`.
- Many dependencies are prebuilt and hosted on GitHub (supporting Node versions 16, 18, 20, 22). If your host has slow access to GitHub (retrying might help), you'll need to compile them manually. If you can't access GitHub at all, you can use the binary or Docker methods below. For compilation issues on Windows, refer to this link: [Compilation issues on Windows](https://blog.csdn.net/jjocwc/article/details/134152602).

### 3. Running via Binary Files
Download the [latest release](https://github.com/xiaobaidadada/filecat/releases) and run the executable for your platform (on Windows, check the processor type to determine if it’s AMD/x64 or ARM, or use `uname -m` on Linux to identify the architecture).
1. Run `filecat.exe --port 5567 --base_folder /home` (default username/password is admin if no username is set).
2. Use the example configuration file and run `filecat --env ./env`.
3. On Linux, you may need to run `sudo chmod +x ./filecat-linux` to give execution permissions.

### 4. Installing to systemd for Linux (running in the background)
This installation installs to systemd as a background process, which requires root privileges. The recommended method for Linux is to use the automatic installation feature:
1. Download the latest version of `filecat-linux`, grant executable permissions, then run `./filecat-linux --install linux`.
2. If you installed via npm, you can directly use `filecat --install linux` to install it to systemd.

### 5. Running via Docker
Run with the following command:
```bash
docker run -d --name filecat --restart=always --net=host -v /home:/home ghcr.io/xiaobaidadada/filecat:latest --port 5567 --base_folder /home
```
Explanation:
1. All executable parameters are available here. You can omit parameters, and they will be set from the project's env file.
2. You can map a configuration file to the program using the `-v` parameter (`-v /home:/home` is necessary for file management, as it sets the base folder).
3. The `--net=host` parameter enables network-related features (virtual networks, DDNS, etc.), but note that some system information may not be accessible inside the container, though CPU and memory usage can still be retrieved from the host.
4. If you only need file management, Docker is sufficient. However, for full functionality, it's recommended to install the program on a physical machine.

## III. Development
- Installation might fail on macOS (untested), but you can use `npm install --ignore-scripts` to bypass issues.
- This project uses Node.js, and web pages are built using React, with no UI framework. Instead, it uses the [filebrowser](https://github.com/filebrowser/filebrowser) project’s CSS. During local development, the server proxies Webpack services. In production, the web page is bundled and served as static assets. The server uses `routing-controllers` for HTTP routing, and the WebSocket handling code is located in the `common` folder. WebSocket uses a modified version of `socket.io-parser` to handle JSON messages. This library supports the `protocolIsProto2` option for using the proto protocol. The original choice of proto over socket.io was made for code reuse.

## IV. Main Features
- **File Management**
  1. Preview file formats like images, videos, markdown, etc.
  2. Code editor with selectable file opening modes.
  3. Image editor that can be accessed by right-clicking on images (uses [Filerobot Image Editor](https://github.com/scaleflex/filerobot-image-editor)).
  4. Studio editor, similar to VS Code, can be used as a temporary Linux development environment.
  5. [Excalidraw](https://github.com/excalidraw/excalidraw) drawing editor, a great whiteboard tool.
  6. Root directory switching—add multiple folder paths in settings and switch the root directory at the top right for a session.
  7. Terminal: A custom terminal that allows filtering of commands and prevents harmful commands like `rm -rf /`. Non-PTY software (like node) requires `-i` or a custom handler.
  8. Large text log viewer: Right-click on any large text file to view it as a log. Supports real-time output and quick scrolling.
  9. Workflow: A local automation build tool, similar to GitHub Actions. You can create workflows, right-click to run, or create `.workflow.yml` files (without pre-processing prompts).
- **SSH Proxy, FTP Proxy**: Manage multiple Linux servers like WinSCP, making terminal and file management more convenient.
- **HTTP Proxy**: Similar to Postman, allows sending HTTP requests.
- **Websites**: A bookmark tool for saving other websites hosted on the server.
- **DDNS**
- **HTTP Web Proxy, RDP Proxy (Windows Remote Desktop), RTSP Proxy Player**: Supports real-time web playback of monitoring streams or live sources.
- **Docker Container**: Image management, viewing logs, and more.
- **System Information**: Real-time CPU and memory usage, process info (like Task Manager on Windows).
- **WOL (Wake on LAN)**: Wake up computers over the network.
- **Virtual Networks**: P2P and VPN functionality (using `tun` to create virtual IPs on the host).
- **Permissions**: Supports various system, file operation, and command permissions.

## V. Feature Notes
1. Some features, such as virtual networks, are **not available on macOS** (and may fail installation). Windows requires admin privileges, and Linux requires root for certain features. Many features have not been tested on macOS.
2. Some features are still in demo phase and will be optimized over time.

## VI. Roadmap
1. Optimize operational details.
2. Support more file formats for viewing.
3. Add more streaming media features.
4. Support more DDNS platforms.
5. Add an automated web crawler.
6. Support mobile devices.

## VII. QQ Group
824838674

## VIII. Acknowledgments
Some features of this project are based on or inspired by the following projects:
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc.js](https://github.com/citronneur/mstsc.js)

---

This is a direct translation of the original text. Let me know if you need further clarification or adjustments!