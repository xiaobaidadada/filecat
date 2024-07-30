import {RCode} from "../../common/Result.pojo";


export type Result<T> = {
    code:RCode,
    message?:string,
    data?:T
}

export function Sucess<T>(data:T,code:RCode = RCode.Sucess):Result<T> {
    return {
        code:code,
        data:data
    }
}

export function Fail(message:string,code:RCode = RCode.Fail):Result<undefined> {
    return {
        code:code,
        message:message
    }
}

export function AuthFail(message:string):Result<undefined> {
    return {
        code:RCode.AuthFail,
        message:message
    }
}
