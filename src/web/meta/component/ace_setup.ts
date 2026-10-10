/**
 * Ace 编辑器的运行时初始化（静态资源加载 + CDN 兜底配置）。
 *
 * 为什么单独抽一个模块：
 *   项目里有两个 Ace 封装组件需要同一套初始化 ——
 *     - Ace.tsx（文件编辑器 / DB 查询，走 editor_data 全局取内容）
 *     - AceCodeEditor.tsx（通用受控编辑器，MD 源码模式等）
 *   这套初始化是「import 即生效」的全局副作用（往 ace 的全局注册表塞 mode/theme、
 *   设置资源加载路径），必须只写一份，否则两边容易漏配、行为不一致。
 *
 * 加载策略（沿用原有规则，保证离线可用性）：
 *   1. 静态 import：把常用语言 + 两个主题 + beautify 扩展打进 bundle，
 *      断网时这些语言照常工作，也不会因 CDN 慢而白屏。
 *   2. CDN 兜底：没静态引入的语言（go / java / cpp / php 等），
 *      由 ace 的运行时按需从 jsdelivr 拉取对应 mode。
 *      注意这一步依赖外网 —— 完全离线时只有上面静态引入的语言可用。
 */

import * as ace from "ace-builds";
import {version as ace_version} from "ace-builds";

// ---------- 静态引入：常用的不需要网络 ----------
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-markdown";
import "ace-builds/src-noconflict/mode-tsx";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-sh";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/mode-sql";
import "ace-builds/src-noconflict/mode-ini";
import "ace-builds/src-noconflict/theme-cloud9_day";
import "ace-builds/src-noconflict/theme-cloud_editor_dark";
// 代码格式化（ext-beautify）供文件编辑器使用
import "ace-builds/src-noconflict/ext-beautify";
// 官方 diff 视图（Git 面板做左右两版对比用）：自带同步滚动、行号对齐、行级与字符级高亮
import "ace-builds/src-noconflict/ext-diff";
// 按文件名推断 mode（文件编辑器用它决定打开什么语法高亮）
import * as modest from "ace-builds/src-noconflict/ext-modelist";

// ---------- CDN 兜底：未静态引入的语言按需远程加载 ----------
// 版本号跟随本地安装的 ace-builds，避免 CDN 上的版本与本地不一致。
const CDN_BASE = `https://gcore.jsdelivr.net/npm/ace-builds@${ace_version}/src-min-noconflict/`;
ace.config.set("basePath", CDN_BASE);
ace.config.set("modePath", CDN_BASE);
ace.config.set("themePath", CDN_BASE);
ace.config.set("workerPath", CDN_BASE);

export {ace, ace_version, modest};
