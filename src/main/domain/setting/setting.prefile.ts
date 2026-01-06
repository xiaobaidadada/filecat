

export const router_pre_file =
`
/**
* pre import
* 1. fs path cache_map( a map object use to cache)
* 2. needle (to http https://www.npmjs.com/package/needle)
*/

class Api {  

    /*
    * customer api 
    * @params headers 
    * @params body 
    * @params req: express req
    */
    async handler(headers,body,req) { 
        
        // todo 处理
        return null;
    }
    
}
`

export const self_auth_open_js_code_file =
`
/**
* pre import
* 1. fs path cache_map( a map object use to cache)
* 2. needle (to http https://www.npmjs.com/package/needle)
*/
 class Api {  
    
    /*
    *  only use to first login to set token for username (只用于登录 为登录的用户设置 token 这个token 拥有这个用户的全部权限) 返回false 后会继续尝试密码登录 
    * @params req_headers:  headers
    * @params req:  repress req
    * return boolen 
    */
    async handler( req_headers,req ) { 
        return false;
    }
    
 }
`

// 自定义shell 命令 判断
export const self_shell_cmd_check_js_code_file =
    `
/**
* pre import
* 1. fs path cache_map( a map object use to cache)
* 2. needle (to http https://www.npmjs.com/package/needle)
*/
 class Api {  
    
    /*
    *  check command to exec 
    * @params token: token
    * @params cmd : command string
    * @params params: string [] 
    * return  -1 (reject)  0 (to  use child_process ) 1 (to use node_pty ) 2 (continue sys judge)
    */
    async handler(token,cmd,params) { 
    
        return -1;
    }
    
 }
`