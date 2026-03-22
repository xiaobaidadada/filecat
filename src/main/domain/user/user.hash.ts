
const crypto = require('crypto');

export function hash_string(input,  salt = '') {
    return crypto.createHash("sha256").update(`${input}${salt??''}`, 'utf8').digest('hex');
}
