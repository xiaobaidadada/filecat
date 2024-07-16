

export class Cache {

    static token :Set<string> = new Set();
    static timerMap = new Map();
    static ignore_update = false;
    static ignore_check= false;

    public static  setToken (token:string):void {
        this.token.add(token);
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
    public static getTokenSet() {
        return this.token;
    }
    public static getTokenMap() {
        return this.timerMap;
    }
    public static setIgnore(mode:boolean) {
        this.ignore_update = mode;
    }
    public static setIgnoreCheck(mode:boolean) {
        this.ignore_check = mode;
    }

    public static  clear() {
        this.timerMap.clear();
        this.token.clear();
    }
    public static check(token) {
        return this.token.has(token);
    }
}
