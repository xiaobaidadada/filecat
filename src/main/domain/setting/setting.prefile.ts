

export const router_pre_file =
`
/**
* pre import
* 1. fs path cache_map( a map object use to cache)
* 2. needle (to http https://www.npmjs.com/package/needle)
* 3. user_login is function params is { username, password } It is best to enable custom AUTH to use custrom token
* 4. create_user is function 
*/

class Api {  

    /*
    * customer api 
    * @params headers 
    * @params body 
    * @params ctx: express ctx
    */
    async handler(headers,body,ctx) { 
        
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
* 3. user_login is function params is { username, password } It is best to enable custom AUTH to use custrom token
* 4. create_user is function 
*/
 class Api {  
    
    /*
    *  only use to first login 只用于登录
    * @params token: token
    * return boolen 
    */
    async handler(req_headers) { 
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
* 3. user_login is function params is { username, password } It is best to enable custom AUTH to use custrom token
* 4. create_user is function 
*/
 class Api {  
    
    /*
    *  check command to exec 
    * @params token: token
    * @params cmd : command string
    * @params params: string [] 
    * return  -1 (reject)  0 (to  use child_process ) 1 (to use node_pty )
    */
    handler(token,cmd,params) { 
    
        return -1;
    }
    
 }
`