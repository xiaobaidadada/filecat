# ![](./src/web/meta/resources/img/logo-70.png) filecat

- 中文 | [Português ](./doc/PT_README.md)
- 中文 | [中文 ](./doc/ZN_README.md)
- Use a beautiful UI based on [filebrowser](https://github.com/filebrowser/filebrowser) to manage files, with additional server management capabilities.
- Install with `npm install filecat -g` and run `filecat`. Add the parameter `filecat --help` for more details. You can also run it directly with the binary. More usage options can be found below.

## Screenshots
![Display](https://github.com/user-attachments/assets/c763018e-c420-491f-92b4-e8b12149b7cd)

## Usage
### Try it out
URL: http://116.198.245.137:5569/
Username and password: `admin`/`admin`. There is no permission system at the moment, so please do not change the password to avoid affecting others' experience.

### Running via npm
- If your server already has Node and npm installed, use `npm install filecat -g` to install it globally and then run the command `filecat`. Alternatively, install it with `npm install filecat` inside your project and run with `npx filecat`.
- If you're experiencing network issues, you can use the Taobao npm mirror: `npm config set registry https://registry.npmmirror.com`, or install temporarily using the mirror: `npm install -g filecat --registry https://registry.npmmirror.com`.

### Running via binary
The latest code is not directly packaged. To use the newest features and bug fixes, you’ll need to package the code yourself.
Download the [latest release](https://github.com/xiaobaidadada/filecat/releases) and run the binary for your platform (x64):
1. Run the command `filecat --port 5567 --base_folder d:/`. If no username is set, the default login will be admin.
2. Use the example configuration file and run with `filecat --env ./env`. On Linux, you may need to run `sudo chmod +x ./filecat-linux` to get execution permissions.
3. If the binary doesn't run, you can build the code yourself or use a non-packaged version (network features are not supported in all environments).

### Installation on Linux with systemd
This installation method sets up filecat to run as a background process with systemd. It requires root privileges. It is recommended to use this installation method for Linux systems. After downloading the latest version of the `filecat-linux` binary, give it execution permissions and run `./filecat-linux --install linux`. If you installed filecat with npm, you can run `filecat --install linux` directly to install it to systemd.

### Development
- Currently, installing directly on macOS may fail (not tested). You can try using `npm install --ignore-scripts` as an alternative.
- This project uses pre-built dependencies to avoid the need for compiling during installation. If there are network issues during installation, the system will attempt to compile the dependencies manually. If you’re on Windows and encounter issues during compilation, consult [this link](https://blog.csdn.net/jjocwc/article/details/134152602) for more information.

## Key Features
- File management
  1. Preview images, videos, markdown, and other formats online.
  2. Code editor, with options to open files in different modes.
  3. Image editor accessible by right-clicking on images.
  4. Studio editor, similar to VSCode, that can be used as a temporary development environment on Linux.
  5. [Excalidraw](https://github.com/excalidraw/excalidraw) diagram editor, an excellent whiteboard tool.
  6. Switch root directories by adding multiple folder paths in settings, switching root directory only for one session.
  7. Terminal that allows real-time navigation through directories.

- SSH, FTP proxy: Manage multiple Linux servers, similar to WinSCP, making terminal and file management more convenient.
- Website: A URL bookmark tool, can be used to save other websites on the server.
- DDNS.
- HTTP web proxy.
- RDP proxy (Windows remote control).
- RTSP proxy player, input a stream URL like a surveillance camera feed to view it in real-time via a webpage.
- Docker container management, including image management and log viewing.
- System memory and CPU info, process CPU info (using a C plugin with minimal resources to monitor all system processes, similar to Windows Task Manager), systemd management (available on Linux).
- WOL (Wake-on-LAN) to remotely power on devices.
- Virtual networks for P2P, VPN functionality (not port forwarding, but by creating virtual IPs on the host using TUN).

## Notes
1. Some features are not available on macOS (such as virtual networks), and on Windows, the application needs to be run in administrator mode. On Linux, root privileges are required for some features.
2. Some features are still in demo stage and will be continuously improved.

## Roadmap
1. Improve more operational details.
2. Support more file formats for browsing.
3. Support more streaming features.
4. Support additional DDNS platforms.
5. Automated web scraping.
6. Route permission management.

## Acknowledgments
Some features in this project are based on or inspired by the following projects:
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
