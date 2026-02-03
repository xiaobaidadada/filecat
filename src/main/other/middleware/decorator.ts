import 'reflect-metadata';
import {Action, Authorized} from "routing-controllers";
import {get_sys_base_url_pre} from "../../domain/bin/bin";


export const public_list = []
const pre = get_sys_base_url_pre()

export function Public(router:string): MethodDecorator & ClassDecorator {
    return (target: any, propertyKey?: string | symbol) => {
        // if (propertyKey) {
        //     Authorized('public')(target, propertyKey); // 标记路由为 public
        // } else {
        //     Authorized('public')(target); // 类级别
        // }
        public_list.push(pre+router);
    };
}


// export async function authorizationChecker(action: Action, list: string[]) {
//     // 在 use 后面执行 没法用
//
//     // 如果这个路由被标记为 public，直接放行
//     if (list && list.includes('public')) {
//         return true;
//     }
//
//     // 继续验证
//     return true;
// }
