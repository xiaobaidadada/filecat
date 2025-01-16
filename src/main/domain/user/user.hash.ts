
const crypto = require('crypto');

export function hash_string(input, algorithm = 'sha256', encoding = 'hex') {
    return crypto.createHash(algorithm).update(`${input}`, 'utf8').digest(encoding);
}