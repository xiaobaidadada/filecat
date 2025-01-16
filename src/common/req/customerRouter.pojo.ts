import {data_common_key} from "../../main/domain/data/data_type";

export class CustomerApiRouterPojo {
    router:string;
    needAuth:boolean;
    note?:string;
}


export const self_auth_jscode = data_common_key.self_auth_jscode;
