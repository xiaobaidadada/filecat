import path from "path";
import fs, {Stats} from "fs";
import fse from 'fs-extra'
import {Env} from "../../../common/Env";
import {execSync} from "child_process";
import {getSys} from "../shell/shell.service";
import {SysEnum} from "../../../common/req/user.req";

const crypto = require('crypto');
const sshpk = require('sshpk');


export class CryptoService {
    home_path = "";

    get_home_path(): string {
        if (this.home_path) {
            return this.home_path;
        }
        this.home_path = path.join(process.env.HOME, ".ssh");
        return this.home_path;
    }

    to_openssh_form(publicKey: string, privateKey: string) {
        // 使用 sshpk 将 PEM 格式的公钥和私钥都转换为 OpenSSH 格式
        const parsedPublicKey = sshpk.parseKey(publicKey);
        const opensshPublicKey = parsedPublicKey.toString('ssh');

        // 使用 sshpk 将 PEM 格式的私钥转换为 OpenSSH 格式
        const parsedPrivateKey = sshpk.parsePrivateKey(privateKey);
        const opensshPrivateKey = parsedPrivateKey.toString('ssh');
        return {opensshPublicKey, opensshPrivateKey};
    }

    get_RSA() {
        // 生成 RSA 公私钥对
        const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048, // 2048 位的 RSA 密钥
            publicKeyEncoding: {
                type: 'spki',  // 公钥编码类型
                format: 'pem', // 使用 PEM 格式
            },
            privateKeyEncoding: {
                type: 'pkcs8', // 私钥编码类型
                format: 'pem', // 使用 PEM 格式
            },
        });
        return {publicKey, privateKey};
    }

    get_ECDSA() {
        // 生成 ECDSA 公私钥对（使用 secp256k1 曲线）
        const {publicKey, privateKey} = crypto.generateKeyPairSync('ec', {
            namedCurve: 'P-521', // 使用 P-521 曲线
            publicKeyEncoding: {
                type: 'spki',  // 公钥编码类型
                format: 'pem', // 使用 PEM 格式
            },
            privateKeyEncoding: {
                type: 'pkcs8', // 私钥编码类型
                format: 'pem', // 使用 PEM 格式
            },
        });
        return {publicKey, privateKey};

    }

    get_DSA() {
        let {publicKey, privateKey} = crypto.generateKeyPairSync('dsa', {
            modulusLength: 2048, // 可以是 1024 或 2048
            publicExponent: 0x10001, // 公钥指数
        });

        // 将密钥对转换为 PEM 格式
        publicKey = publicKey.export({type: 'spki', format: 'pem'});
        privateKey = privateKey.export({type: 'pkcs8', format: 'pem'});
        return {publicKey, privateKey};
    }

    generate(type: string, form: string) {
        let public_key: string, private_key: string;
        switch (type) {
            case 'rsa': {
                const {publicKey, privateKey} = this.get_RSA();
                private_key = privateKey;
                public_key = publicKey;
            }
                break;
            case 'ecdsa': {
                const {publicKey, privateKey} = this.get_ECDSA();
                private_key = privateKey;
                public_key = publicKey;
            }
                break;
            case 'dsa': {
                const {publicKey, privateKey} = this.get_DSA();
                private_key = privateKey;
                public_key = publicKey;
            }
        }
        if (form === "pem" || !public_key || !private_key) {
            return {public_key, private_key};
        } else {
            const {opensshPublicKey, opensshPrivateKey} = this.to_openssh_form(public_key, private_key);
            return {public_key: opensshPublicKey, private_key: opensshPrivateKey, home_path: this.get_home_path()};
        }

    }

    save_openssh(name: string, context: string) {
        fse.ensureDirSync(this.get_home_path());
        const rpath = path.join(this.get_home_path(), name);
        fs.writeFileSync(rpath, context);
        if (getSys() === SysEnum.linux) {
            execSync(`chmod 600 ${rpath}`) // 保证权限不至于太宽松
        }
    }
}

export const crypto_service: CryptoService = new CryptoService();