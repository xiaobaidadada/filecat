// 不需要引用，在ts配置中导入就行
declare module '*.svg' {
    const src: string
    export default src
}