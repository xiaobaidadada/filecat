"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ptyPath = void 0;
var fs = require("fs");
var os = require("os");
var path = require("path");
function prebuildName() {
    var tags = [];
    tags.push(process.versions.hasOwnProperty('electron') ? 'electron' : 'node');
    tags.push('abi' + process.versions.modules);
    if (os.platform() === 'linux' && fs.existsSync('/etc/alpine-release')) {
        tags.push('musl');
    }
    return tags.join('.') + '.node';
}
var pathToBuild = path.resolve(__dirname, "../prebuilds/".concat(os.platform(), "-").concat(os.arch(), "/").concat(prebuildName()));
exports.ptyPath = fs.existsSync(pathToBuild) ? pathToBuild : null;
//# sourceMappingURL=prebuild-file-path.js.map