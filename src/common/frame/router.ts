// 用于保存对象实例，避免重复创建，因为typedi必须要提前创建，但是这里是最提前的所以需要自己创建
import {CmdType} from "./WsData";

const objMap = new Map<string,Object>();
export const routerHandlerMap = new Map<CmdType,Function>();

export function msg(msg:CmdType) {
    /**
     *
     * @param target 目标对象，也是构造器 可以构造器创建
     * @param key 属性名
     * @param descriptor 描述符
     */
    return (target: any, key: string, descriptor: PropertyDescriptor)=>{
        const p = objMap.get(target.name);
        const obj = p??new target.constructor();
        descriptor.value
        routerHandlerMap.set(msg,obj[key].bind(obj))
        // const originalMethod = descriptor.value;
        // descriptor.value = function (...args: any[]) {
        //     console.log(`Calling ${key} with arguments: ${args}`);
        //     return originalMethod.apply(this, args);
        // };
    }

}

