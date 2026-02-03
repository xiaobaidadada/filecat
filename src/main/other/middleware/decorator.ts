import 'reflect-metadata';
import {Action, Authorized} from "routing-controllers";


export function Public(): MethodDecorator & ClassDecorator {
    return (target: any, propertyKey?: string | symbol) => {
        if (propertyKey) {
            Authorized('public')(target, propertyKey); // 标记路由为 public
        } else {
            Authorized('public')(target); // 类级别
        }
    };
}


export async function authorizationChecker(action: Action, list: string[]) {
    // 在 use 后面执行

    // 如果这个路由被标记为 public，直接放行
    if (list && list.includes('public')) {
        return true;
    }

    // 继续验证
    return true;
}
