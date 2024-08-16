# filecat
English | [中文](./doc/ZH_README.md)

This is a web-based toolkit for developers that includes file management and server utilities. It supports online file compression and decompression, terminal access, SSH proxy, P2P, DDNS, and other features.
# Screenshot
![image](https://github.com/user-attachments/assets/37ffe3bf-19b9-4da0-9eaf-deb3d0a4d034)
![image](https://github.com/user-attachments/assets/12df7c32-7bde-4c5c-80e4-eedb57c18de9)

# Usage
## Demo
url: http://116.198.245.137:5569/
credentials: `admin`/`admin` Currently, there is no permission functionality, so please do not change the password as it may affect the experience of others.
### Direct Usage
Download the[latest release ](https://github.com/xiaobaidadada/filecat/releases)
and run the executable for your platform;
1. Execute the command filecat --port 5567 --base_folder d:/. If you do not set a username, the default username and password are admin.
2. Use the configuration file from the example and execute the command filecat --env ./env. On Linux, you may need to run sudo chmod +x ./filecat-linux to gain execution permissions
### Development
The project is currently packaged using pkg. Please use Node.js version 18.x.x.

## Feature Description
1. The peer-to-peer client functionality does not work on macOS. On Windows, it requires administrator mode, and on Linux, it requires root privileges. Additionally, many features have not been tested on macOS and are only supported on Windows and Linux.
2. Some features are currently in the demo stage and will be continuously optimized in the future.
# Roadmap
- Optimize process information retrieval, SSH file management, DDNS logging, and other features.
- Add more file management features.

# Thanks
Some features of this project are based on or inspired by the following projects.
- [filebrowser](https://github.com/filebrowser/filebrowser)
- [MeshCentral](https://github.com/Ylianst/MeshCentral)
- [mstsc](https://github.com/citronneur/mstsc.js)
