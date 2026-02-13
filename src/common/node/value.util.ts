
const XXH = require('xxhashjs');

export function hash_str_to_number(path: string) {
    return XXH.h64(path, 0xABCD).toNumber();
}