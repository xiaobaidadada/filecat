

export class Cache {

    static token :Map<string,any> = new Map();
    static timerMap = new Map();
    static ignore_update = false;
    static ignore_check= false;

    public static  setToken (token:string):void {
        this.token.set(token,{});
        if (!this.ignore_check) {
            this.timerMap.set(token,setTimeout(()=>{
                this.token.delete(token);
                this.timerMap.delete(token);
            },1000*60*60))
        }

    }
    public static updateTimer(token:string) {
        if (this.ignore_update) {
            return;
        }
        const timer = this.timerMap.get(token);
        if (timer) {
            clearTimeout(timer);
            this.timerMap.set(token,setTimeout(()=>{
                this.token.delete(token);
                this.timerMap.delete(token);
            },1000*60*60))
        }
    }
    public static getTokenMap() {
        return this.token;
    }
    public static getTokenTimerMap() {
        return this.timerMap;
    }
    public static setIgnore(mode:boolean) {
        this.ignore_update = mode;
    }
    public static setIgnoreCheck(mode:boolean) {
        this.ignore_check = mode;
    }

    public static  clearTokenTimerMap() {
        this.timerMap.forEach(v=>clearTimeout(v));;
        this.timerMap.clear();
    }
    public static  clear() {
        this.timerMap.clear();
        this.token.clear();
    }
    public static check(token) {
        return this.token.has(token);
    }
}
