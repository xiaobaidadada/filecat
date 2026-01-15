import { readFile, writeFile, readdir } from 'fs/promises';


// read_file 工具
export async function read_file(text) {
    const {path} = JSON.parse(text)
    const content = await readFile(path, 'utf-8');
    return content;
}

// list_files 工具
export async function list_files({ path = '.' }) {
    const files = await readdir(path, { withFileTypes: true });
    return files.map(f => `${f.isDirectory() ? 'DIR ' : 'FILE'} ${f.name}`).join('\n');
}

// edit_file 工具
export async function edit_file({ path, old_str, new_str }) {
    let orig = '';
    try {
        orig = await readFile(path, 'utf-8');
    } catch {
        orig = '';
    }
    const updated = orig.split(old_str).join(new_str);
    await writeFile(path, updated, 'utf-8');
    return 'OK';
}
