

export class Cache {

    static token :Set<string> = new Set();
    static timerMap = new Map();
    public static  setToken (token:string):void {
        this.token.add(token);
        this.timerMap.set(token,setTimeout(()=>{
            this.token.delete(token);
            this.timerMap.delete(token);
        },1000*60*60))
    }
    public static updateTimer(token:string) {
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
}
