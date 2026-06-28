import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {Fail, Result, Sucess} from "../../../other/Result";
import {RCode} from "../../../../common/Result.pojo";
import {settingService} from "../../setting/setting.service";
import {userService} from "../../user/user.service";
import {FileUtil} from "../FileUtil";
import {
    GcfgPageType,
    GcfgFieldType,
    GcfgPageConfig,
    GcfgFileContent,
    GcfgExportConfig,
    GcfgPageMeta,
    GcfgFieldMeta,
    GcfgDictData,
    GcfgTwoDimData,
    GcfgConstData,
} from "../../../../common/gcfg.pojo";

const GcfgFieldTypeTsMap: Record<string, string> = {
    [GcfgFieldType.String]: 'string',
    [GcfgFieldType.Number]: 'number',
    [GcfgFieldType.Boolean]: 'boolean',
};

const GcfgFieldTypeGoMap: Record<string, string> = {
    [GcfgFieldType.String]: 'string',
    [GcfgFieldType.Number]: 'float64',
    [GcfgFieldType.Boolean]: 'bool',
};

export class GcfgService {

    private resolvePath(token: string, filePath: string): string {
        const root = settingService.getFileRootPath(token);
        const sysPath = path.join(root, decodeURIComponent(filePath));
        userService.check_user_path(token, sysPath);
        return sysPath;
    }

    /** 读取 gcfg 文件 */
    async loadGcfg(token: string, filePath: string): Promise<Result<GcfgFileContent>> {
        const sysPath = this.resolvePath(token, filePath);
        if (!await FileUtil.access(sysPath)) {
            return Fail("文件不存在", RCode.Fail);
        }
        const raw = await FileUtil.readFileSync(sysPath);
        const content = raw.toString('utf8');
        try {
            const data = yaml.load(content) as GcfgFileContent;
            if (!data || !data.config) {
                return Fail("gcfg 格式无效：缺少 config", RCode.Fail);
            }
            return Sucess(data);
        } catch (e: any) {
            return Fail(`YAML 解析失败: ${e.message}`, RCode.Fail);
        }
    }

    /** 保存 gcfg 文件 */
    async saveGcfg(token: string, filePath: string, content: GcfgFileContent): Promise<Result<string>> {
        const sysPath = this.resolvePath(token, filePath);
        userService.check_user_only_path(token, sysPath);
        try {
            const yamlStr = yaml.dump(content, { indent: 2, lineWidth: -1, noRefs: true });
            await FileUtil.writeFileSync(sysPath, yamlStr, { encoding: 'utf8' });
            return Sucess("ok");
        } catch (e: any) {
            return Fail(`保存失败: ${e.message}`, RCode.Fail);
        }
    }

    /** 加载目录下所有 gcfg 文件列表 */
    async loadGcfgList(token: string, dirPath: string, search?: string): Promise<Result<string[]>> {
        const sysPath = this.resolvePath(token, dirPath);
        if (!await FileUtil.access(sysPath)) {
            return Fail("目录不存在", RCode.Fail);
        }
        const items = await FileUtil.readdirSync(sysPath);
        const gcfgFiles: string[] = [];
        for (const f of items) {
            if (!f.endsWith('.gcfg')) continue;
            // 过滤掉 .gcfg 目录，只保留文件
            const itemPath = path.join(sysPath, f);
            const stat = await FileUtil.statSync(itemPath);
            if (stat.isFile()) {
                gcfgFiles.push(f.replace('.gcfg', ''));
            }
        }
        if (search) {
            const kw = search.toLowerCase();
            return Sucess(gcfgFiles.filter((f: string) => f.toLowerCase().includes(kw)));
        }
        return Sucess(gcfgFiles);
    }

    /** 加载/保存导出配置 */
    private getConfigPath(token: string, dirPath: string): string {
        const sysPath = this.resolvePath(token, dirPath);
        return path.join(sysPath, '.gcfg', 'config.json');
    }

    async loadExportConfig(token: string, dirPath: string): Promise<Result<GcfgExportConfig>> {
        const cfgPath = this.getConfigPath(token, dirPath);
        if (!await FileUtil.access(cfgPath)) {
            return Sucess({ exportDir: '', exportTypes: ['ts'] });
        }
        const raw = await FileUtil.readFileSync(cfgPath);
        return Sucess(JSON.parse(raw.toString('utf8')));
    }

    async saveExportConfig(token: string, dirPath: string, config: GcfgExportConfig): Promise<Result<string>> {
        const cfgPath = this.getConfigPath(token, dirPath);
        const cfgDir = path.dirname(cfgPath);
        if (!await FileUtil.access(cfgDir)) {
            await FileUtil.mkdirSync(cfgDir, { recursive: true });
        }
        userService.check_user_only_path(token, cfgDir);
        await FileUtil.writeFileSync(cfgPath, JSON.stringify(config, null, 2), { encoding: 'utf8' });
        return Sucess("ok");
    }

    /** 生成代码元数据 */
    generatePageMeta(content: GcfgFileContent, fileName: string): GcfgPageMeta {
        const cfg = content.config;
        const flName = cfg.enName.charAt(0).toLowerCase() + cfg.enName.slice(1);
        const meta: GcfgPageMeta = {
            name: cfg.enName.charAt(0).toUpperCase() + cfg.enName.slice(1),
            flName,
            type: '',
            fileName,
            pageName: cfg.enName,
            dictKeys: [],
            valueTsType: 'string',
            valueGoType: 'string',
            xKeys: [],
            yKeys: [],
        };

        switch (cfg.type) {
            case GcfgPageType.Const: {
                meta.type = 'Constant';
                // Const 类型不再有统一的 valueType，每个 key 有自己的类型
                meta.valueTsType = 'any';
                meta.valueGoType = 'interface{}';
                break;
            }
            case GcfgPageType.Dict: {
                meta.type = 'Dict';
                const dc = cfg.dict!;
                // 新版：每列都有自己的类型，不再有统一的 valueType
                meta.valueTsType = 'any';
                meta.valueGoType = 'interface{}';
                for (const k of dc.keys) {
                    meta.dictKeys.push({ name: k.enName, desc: k.desc });
                }
                break;
            }
            case GcfgPageType.TwoDim: {
                meta.type = 'TwoDim';
                const tc = cfg.twoDim!;
                meta.valueTsType = GcfgFieldTypeTsMap[tc.valueType] || 'string';
                meta.valueGoType = GcfgFieldTypeGoMap[tc.valueType] || 'string';
                for (const k of tc.xKeys) {
                    meta.xKeys.push({ name: k.enName, desc: k.desc });
                }
                for (const k of tc.yKeys) {
                    meta.yKeys.push({ name: k.enName, desc: k.desc });
                }
                break;
            }
        }
        return meta;
    }

    /** 解析 value 字符串为 TS 代码 */
    private tsValue(raw: string, tsType: string): string {
        if (tsType === 'number') {
            return `${parseFloat(raw) || 0}`;
        } else if (tsType === 'boolean') {
            return `${raw === 'true' || raw === '1'}`;
        } else {
            return JSON.stringify(raw);
        }
    }

    /** 解析 value 字符串为 Go 代码 */
    private goValue(raw: string, goType: string): string {
        if (goType === 'float64') {
            return `${parseFloat(raw) || 0}`;
        } else if (goType === 'bool') {
            return `${raw === 'true' || raw === '1'}`;
        } else {
            return `"${raw}"`;
        }
    }

    /** 生成 TypeScript 代码 */
    generateTsCode(meta: GcfgPageMeta, content: GcfgFileContent): string {
        const cfg = content.config;
        let code = `// AUTO GENERATED - DO NOT MODIFY\n`;
        code += `// Source: ${meta.fileName}.gcfg\n\n`;

        switch (cfg.type) {
            case GcfgPageType.Const: {
                const constData = content.data as GcfgConstData;
                const values = constData?.values || {};
                const keys = cfg.const_?.keys || [];
                const keyTypeMap: Record<string, string> = {};
                for (const k of keys) {
                    keyTypeMap[k.enName] = GcfgFieldTypeTsMap[k.valueType] || 'string';
                }

                // 生成常量为类，每个 key 是实例属性
                code += `export class ${meta.name} {\n`;
                for (const [key, val] of Object.entries(values)) {
                    const tsType = keyTypeMap[key] || 'string';
                    code += `    /** ${keys.find(k => k.enName === key)?.desc || ''} */\n`;
                    code += `    readonly ${key}: ${tsType} = ${this.tsValue(val, tsType)};\n`;
                }
                code += `}\n\n`;
                // 导出单例
                code += `export const ${meta.flName || (meta.name.charAt(0).toLowerCase() + meta.name.slice(1))} = new ${meta.name}();\n`;
                break;
            }
            case GcfgPageType.Dict: {
                const dictData = content.data as GcfgDictData;
                const dictKeys = cfg.dict?.keys || [];
                const keyTypeMap: Record<string, string> = {};
                for (const k of dictKeys) {
                    keyTypeMap[k.enName] = GcfgFieldTypeTsMap[k.valueType] || 'string';
                }

                // 行数据类型
                code += `export interface I${meta.name}Row {\n`;
                for (const k of dictKeys) {
                    const tsType = keyTypeMap[k.enName] || 'string';
                    code += `    /** ${k.desc} */\n`;
                    code += `    ${k.enName}: ${tsType};\n`;
                }
                code += `}\n\n`;

                // 生成类，内部持有数据
                code += `export class ${meta.name} {\n`;
                code += `    private _rows: I${meta.name}Row[] = [\n`;
                for (const row of dictData.rows) {
                    code += `        {\n`;
                    for (const k of dictKeys) {
                        const tsType = keyTypeMap[k.enName] || 'string';
                        code += `            ${k.enName}: ${this.tsValue(row[k.enName] || '', tsType)},\n`;
                    }
                    code += `        },\n`;
                }
                code += `    ];\n\n`;
                // getById
                code += `    /** 通过 id 获取字典对象 */\n`;
                code += `    getById(id: string): I${meta.name}Row | undefined {\n`;
                code += `        return this._rows.find(r => r.id === id);\n`;
                code += `    }\n\n`;
                // hasId
                code += `    /** 判断 id 是否存在 */\n`;
                code += `    hasId(id: string): boolean {\n`;
                code += `        return this._rows.some(r => r.id === id);\n`;
                code += `    }\n\n`;
                // count
                code += `    /** 字典内 id 总数 */\n`;
                code += `    count(): number {\n`;
                code += `        return this._rows.length;\n`;
                code += `    }\n`;
                code += `}\n\n`;
                // 导出单例
                code += `export const ${meta.flName || (meta.name.charAt(0).toLowerCase() + meta.name.slice(1))} = new ${meta.name}();\n`;
                break;
            }
            case GcfgPageType.TwoDim: {
                const twoDimData = content.data as GcfgTwoDimData;
                const cells = twoDimData.cells || {};
                const xSet = new Set<string>();
                const ySet = new Set<string>();
                for (const [xk, inner] of Object.entries(cells)) {
                    xSet.add(xk);
                    for (const yk of Object.keys(inner)) {
                        ySet.add(yk);
                    }
                }

                code += `export type ${meta.name}Value = ${meta.valueTsType};\n\n`;

                code += `export class ${meta.name} {\n`;
                code += `    private _data: Record<string, Record<string, ${meta.valueTsType}>> = {\n`;
                for (const [xk, inner] of Object.entries(cells)) {
                    code += `        "${xk}": {\n`;
                    for (const [yk, val] of Object.entries(inner)) {
                        code += `            "${yk}": ${this.tsValue(val, meta.valueTsType)},\n`;
                    }
                    code += `        },\n`;
                }
                code += `    };\n\n`;

                // _xKeys, _yKeys
                const xKeysArr = [...xSet];
                const yKeysArr = [...ySet];
                code += `    private _xKeys: string[] = ${JSON.stringify(xKeysArr)};\n`;
                code += `    private _yKeys: string[] = ${JSON.stringify(yKeysArr)};\n\n`;

                // getValue
                code += `    /** 获取值 */\n`;
                code += `    getValue(x: string, y: string): ${meta.valueTsType} | undefined {\n`;
                code += `        return this._data[x]?.[y];\n`;
                code += `    }\n\n`;
                // hasX
                code += `    /** 判断 x 轴 key 是否存在 */\n`;
                code += `    hasX(x: string): boolean {\n`;
                code += `        return x in this._data;\n`;
                code += `    }\n\n`;
                // hasY
                code += `    /** 判断 y 轴 key 是否存在 */\n`;
                code += `    hasY(y: string): boolean {\n`;
                code += `        return this._yKeys.includes(y);\n`;
                code += `    }\n\n`;
                // xCount
                code += `    /** x 轴方向有多少列 */\n`;
                code += `    xCount(): number {\n`;
                code += `        return this._xKeys.length;\n`;
                code += `    }\n\n`;
                // yCount
                code += `    /** y 轴方向有多少行 */\n`;
                code += `    yCount(): number {\n`;
                code += `        return this._yKeys.length;\n`;
                code += `    }\n`;
                code += `}\n\n`;
                // 导出单例
                code += `export const ${meta.flName || (meta.name.charAt(0).toLowerCase() + meta.name.slice(1))} = new ${meta.name}();\n`;
                break;
            }
        }
        return code;
    }

    /** 生成 Go 代码 */
    generateGoCode(meta: GcfgPageMeta, content: GcfgFileContent): string {
        const cfg = content.config;
        let code = `// AUTO GENERATED - DO NOT MODIFY\n`;
        code += `// Source: ${meta.fileName}.gcfg\n\n`;
        code += `package config\n\n`;

        switch (cfg.type) {
            case GcfgPageType.Const: {
                code += `// ${meta.name} constants\n`;
                const constData = content.data as GcfgConstData;
                const values = constData?.values || {};
                const keys = cfg.const_?.keys || [];
                const keyTypeMap: Record<string, string> = {};
                for (const k of keys) {
                    keyTypeMap[k.enName] = GcfgFieldTypeGoMap[k.valueType] || 'string';
                }

                // 结构体，每个 key 是字段
                code += `type ${meta.name} struct {\n`;
                for (const [key, val] of Object.entries(values)) {
                    const goType = keyTypeMap[key] || 'string';
                    const desc = keys.find(k => k.enName === key)?.desc || '';
                    code += `    // ${desc}\n`;
                    code += `    ${capitalize(key)} ${goType}\n`;
                }
                code += `}\n\n`;

                // 初始化函数，返回结构体值（不是指针）
                code += `func New${meta.name}() ${meta.name} {\n`;
                code += `    return ${meta.name}{\n`;
                for (const [key, val] of Object.entries(values)) {
                    const goType = keyTypeMap[key] || 'string';
                    code += `        ${capitalize(key)}: ${this.goValue(val, goType)},\n`;
                }
                code += `    }\n`;
                code += `}\n\n`;

                // 导出变量（单例）
                code += `var ${meta.name}Inst = New${meta.name}()\n`;
                break;
            }
            case GcfgPageType.Dict: {
                const dictData = content.data as GcfgDictData;
                const dictKeys = cfg.dict?.keys || [];
                const keyTypeMap: Record<string, string> = {};
                for (const k of dictKeys) {
                    keyTypeMap[k.enName] = GcfgFieldTypeGoMap[k.valueType] || 'string';
                }

                // 行结构体
                code += `type ${meta.name}Row struct {\n`;
                for (const k of dictKeys) {
                    const goType = keyTypeMap[k.enName] || 'string';
                    code += `    ${capitalize(k.enName)} ${goType} \`json:"${k.enName}"\`\n`;
                }
                code += `}\n\n`;

                // 字典结构体，内部持有切片
                code += `type ${meta.name} struct {\n`;
                code += `    rows []${meta.name}Row\n`;
                code += `}\n\n`;

                // 构造函数
                code += `func New${meta.name}() *${meta.name} {\n`;
                code += `    return &${meta.name}{\n`;
                code += `        rows: []${meta.name}Row{\n`;
                for (const row of dictData.rows) {
                    code += `            {\n`;
                    for (const k of dictKeys) {
                        const goType = keyTypeMap[k.enName] || 'string';
                        code += `                ${capitalize(k.enName)}: ${this.goValue(row[k.enName] || '', goType)},\n`;
                    }
                    code += `            },\n`;
                }
                code += `        },\n`;
                code += `    }\n`;
                code += `}\n\n`;

                // GetById 方法
                code += `func (d *${meta.name}) GetById(id string) *${meta.name}Row {\n`;
                code += `    for i := range d.rows {\n`;
                code += `        if d.rows[i].Id == id {\n`;
                code += `            return &d.rows[i]\n`;
                code += `        }\n`;
                code += `    }\n`;
                code += `    return nil\n`;
                code += `}\n\n`;

                // HasId 方法
                code += `func (d *${meta.name}) HasId(id string) bool {\n`;
                code += `    for _, r := range d.rows {\n`;
                code += `        if r.Id == id {\n`;
                code += `            return true\n`;
                code += `        }\n`;
                code += `    }\n`;
                code += `    return false\n`;
                code += `}\n\n`;

                // Count 方法
                code += `func (d *${meta.name}) Count() int {\n`;
                code += `    return len(d.rows)\n`;
                code += `}\n\n`;

                // 导出变量
                code += `var ${meta.name}Inst = New${meta.name}()\n`;
                break;
            }
            case GcfgPageType.TwoDim: {
                const twoDimData = content.data as GcfgTwoDimData;
                const cells = twoDimData.cells || {};
                const xSet = new Set<string>();
                const ySet = new Set<string>();
                for (const [xk, inner] of Object.entries(cells)) {
                    xSet.add(xk);
                    for (const yk of Object.keys(inner)) {
                        ySet.add(yk);
                    }
                }

                code += `type ${meta.name} struct {\n`;
                code += `    data  map[string]map[string]${meta.valueGoType}\n`;
                code += `    xKeys []string\n`;
                code += `    yKeys []string\n`;
                code += `}\n\n`;

                // 构造函数
                code += `func New${meta.name}() *${meta.name} {\n`;
                code += `    return &${meta.name}{\n`;
                code += `        data: map[string]map[string]${meta.valueGoType}{\n`;
                for (const [xk, inner] of Object.entries(cells)) {
                    code += `            "${xk}": {\n`;
                    for (const [yk, val] of Object.entries(inner)) {
                        code += `                "${yk}": ${this.goValue(val, meta.valueGoType)},\n`;
                    }
                    code += `            },\n`;
                }
                code += `        },\n`;
                const xKeysArr = [...xSet];
                const yKeysArr = [...ySet];
                code += `        xKeys: []string{${xKeysArr.map(v => `"${v}"`).join(', ')}},\n`;
                code += `        yKeys: []string{${yKeysArr.map(v => `"${v}"`).join(', ')}},\n`;
                code += `    }\n`;
                code += `}\n\n`;

                // GetValue
                code += `func (t *${meta.name}) GetValue(x string, y string) ${meta.valueGoType} {\n`;
                code += `    if row, ok := t.data[x]; ok {\n`;
                code += `        if val, ok := row[y]; ok {\n`;
                code += `            return val\n`;
                code += `        }\n`;
                code += `    }\n`;
                code += `    var zero ${meta.valueGoType}\n`;
                code += `    return zero\n`;
                code += `}\n\n`;

                // HasX
                code += `func (t *${meta.name}) HasX(x string) bool {\n`;
                code += `    _, ok := t.data[x]\n`;
                code += `    return ok\n`;
                code += `}\n\n`;

                // HasY
                code += `func (t *${meta.name}) HasY(y string) bool {\n`;
                code += `    for _, ky := range t.yKeys {\n`;
                code += `        if ky == y {\n`;
                code += `            return true\n`;
                code += `        }\n`;
                code += `    }\n`;
                code += `    return false\n`;
                code += `}\n\n`;

                // XCount
                code += `func (t *${meta.name}) XCount() int {\n`;
                code += `    return len(t.xKeys)\n`;
                code += `}\n\n`;

                // YCount
                code += `func (t *${meta.name}) YCount() int {\n`;
                code += `    return len(t.yKeys)\n`;
                code += `}\n\n`;

                // 导出变量
                code += `var ${meta.name}Inst = New${meta.name}()\n`;
                break;
            }
        }
        return code;
    }

    /** 导出所有表 */
    async exportAll(
        token: string,
        dirPath: string,
        exportConfig: GcfgExportConfig
    ): Promise<Result<{ generated: string[]; errors: string[] }>> {
        const resolvedDir = this.resolvePath(token, dirPath);
        const items = await FileUtil.readdirSync(resolvedDir);
        // 过滤掉 .gcfg 目录，只保留 .gcfg 文件
        const gcfgFiles: string[] = [];
        for (const item of items) {
            if (!item.endsWith('.gcfg')) continue;
            const itemPath = path.join(resolvedDir, item);
            const stat = await FileUtil.statSync(itemPath);
            if (stat.isFile()) {
                gcfgFiles.push(item);
            }
        }

        const exportDir = exportConfig.exportDir;
        if (!exportDir) {
            return Fail("请先设置导出目录", RCode.Fail);
        }
        if (!exportConfig.exportTypes || exportConfig.exportTypes.length === 0) {
            return Fail("请选择导出语言", RCode.Fail);
        }

        // 导出前：删除之前的导出目录（完全清理后重新生成）
        if (fs.existsSync(exportDir)) {
            fs.rmSync(exportDir, { recursive: true, force: true });
        }
        fs.mkdirSync(exportDir, { recursive: true });

        const generated: string[] = [];
        const errors: string[] = [];

        for (const lang of exportConfig.exportTypes) {
            const langDir = path.join(exportDir, lang);
            if (!fs.existsSync(langDir)) {
                fs.mkdirSync(langDir, { recursive: true });
            }

            const indexFiles: string[] = [];

            for (const fileName of gcfgFiles) {
                try {
                    const filePath = path.join(resolvedDir, fileName);
                    const raw = fs.readFileSync(filePath, 'utf8');
                    const content = yaml.load(raw) as GcfgFileContent;
                    if (!content || !content.config) {
                        errors.push(`${fileName}: 缺少 config`);
                        continue;
                    }

                    const baseName = fileName.replace('.gcfg', '');
                    const meta = this.generatePageMeta(content, baseName);
                    let code: string;
                    let ext: string;

                    if (lang === 'ts') {
                        code = this.generateTsCode(meta, content);
                        ext = '.ts';
                    } else {
                        // go
                        code = this.generateGoCode(meta, content);
                        ext = '.go';
                    }
                    const outPath = path.join(langDir, `${baseName}${ext}`);
                    fs.writeFileSync(outPath, code, 'utf8');
                    indexFiles.push(baseName);

                    generated.push(`${lang}/${baseName}`);
                } catch (e: any) {
                    errors.push(`${fileName}: ${e.message}`);
                }
            }

            // 生成 index.ts
            if (lang === 'ts' && indexFiles.length > 0) {
                let indexContent = `// AUTO GENERATED - DO NOT MODIFY\n`;
                indexContent += `// All config tables\n\n`;
                for (const f of indexFiles) {
                    indexContent += `export * from './${f}';\n`;
                }
                fs.writeFileSync(path.join(langDir, 'index.ts'), indexContent, 'utf8');
                generated.push(`ts/index.ts`);
            }
        }

        return Sucess({ generated, errors });
    }
}

function capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export const gcfgService = new GcfgService();
