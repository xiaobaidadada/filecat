// 不需要引用，在ts配置中导入就行

// 动态 import 的 CSS 与静态副作用导入不同，TS 会做模块解析，
// 需要显式声明，否则报 TS2307；webpack 仍按正常规则打包。
declare module "simple-mind-map/dist/simpleMindMap.esm.css";
