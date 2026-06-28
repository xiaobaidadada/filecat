/**
 * gcfg 配置表类型定义
 * 游戏策划填表生成代码的数据结构
 */

// 表格类型枚举
export enum GcfgPageType {
    Dict = 'dict',       // 字典 - 多个key字段映射到一个value
    Const = 'const',     // 常量 - 每个key是一个带类型的值
    TwoDim = 'twodim',   // 二维表 - X轴keys × Y轴keys → value
}

// 字段数据类型（value的类型）
export enum GcfgFieldType {
    String = 'string',
    Number = 'number',
    Boolean = 'boolean',
    StringArray = 'string[]',
    NumberArray = 'number[]',
    BooleanArray = 'boolean[]',
}

// 字典表：一个 key 字段定义
export interface GcfgDictKeyDef {
    enName: string;          // 英文字段名（变量名，必须合法）
    desc: string;            // 中文名
    valueType: GcfgFieldType; // 该列的数据类型
}

// 字典表表结构
export interface GcfgDictConfig {
    keys: GcfgDictKeyDef[];  // 多个key字段（第一列固定为「编号」，类型为string）
}

// 二维表：X/Y key 定义
export interface GcfgTwoDimKeyDef {
    enName: string;          // 英文字段名
    desc: string;            // 中文名
}

// 二维表表结构
export interface GcfgTwoDimConfig {
    xKeys: GcfgTwoDimKeyDef[]; // X轴keys（列头）
    yKeys: GcfgTwoDimKeyDef[]; // Y轴keys（行头）
    valueType: GcfgFieldType;  // value的类型
}

// 常量表：每条常量的定义
export interface GcfgConstKeyDef {
    enName: string;           // 英文常量名（变量名）
    desc: string;             // 中文名
    valueType: GcfgFieldType; // 该常量的值类型
}

// 常量表表结构
export interface GcfgConstConfig {
    keys: GcfgConstKeyDef[];  // 所有常量定义，每个 key 可以有不同类型
}

// 页面配置（根据type用不同的config）
export interface GcfgPageConfig {
    type: GcfgPageType;
    enName: string;                    // 英文表名（用于导出的类名）
    dict?: GcfgDictConfig;
    twoDim?: GcfgTwoDimConfig;
    const_?: GcfgConstConfig;
}

// ========== 数据存储格式 ==========

// 字典表一行数据：key字段名 → 该列的值（原始字符串）
export type GcfgDictRowData = Record<string, string>;

// 字典表数据
export interface GcfgDictData {
    rows: GcfgDictRowData[];
}

// 二维表数据：xKey的enName → yKey的enName → value字符串
// 行列由表结构(xKeys/yKeys)固定，用户只需填写交叉单元格的值
export interface GcfgTwoDimData {
    cells: Record<string, Record<string, string>>;
}

// 常量表数据
export interface GcfgConstData {
    values: Record<string, string>;  // 常量英文名 → 值（原始字符串）
}

// 完整的 gcfg 文件内容
export interface GcfgFileContent {
    config: GcfgPageConfig;
    data?: GcfgConstData | GcfgDictData | GcfgTwoDimData;
}

// 导出配置
export interface GcfgExportConfig {
    exportDir: string;     // 导出目录
    exportTypes: ('ts' | 'go')[];  // 导出语言类型
}

// 代码生成用的 key 元数据
export interface GcfgKeyMeta {
    name: string;           // 英文变量名
    desc: string;           // 中文名
}

// 代码生成用的字段元数据
export interface GcfgFieldMeta {
    name: string;           // 英文变量名
    desc: string;           // 中文名
    tsType: string;         // TS类型
    goType: string;         // Go类型
}

// 代码生成用的页面元数据
export interface GcfgPageMeta {
    name: string;              // 大写类名
    flName: string;            // 小写驼峰名
    type: string;              // Dict/Const/TwoDim
    fileName: string;          // 文件名
    pageName: string;          // 表名
    // Dict
    dictKeys: GcfgKeyMeta[];
    valueTsType: string;
    valueGoType: string;
    // TwoDim
    xKeys: GcfgKeyMeta[];
    yKeys: GcfgKeyMeta[];
}
