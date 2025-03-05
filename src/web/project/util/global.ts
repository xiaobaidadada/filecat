
export class Global {
    private static _init:boolean = false;
    private static _base_url:string = "";

    public static init() {
        if(this._init)return;
        if(process.env.NODE_ENV === "production") {
            console.log = ()=>{};
            const code = document.getElementById("pre_code").innerHTML;
            try {
                const obj = new Function(code)();
                this._base_url = obj.base_url;
            } catch (e) {
                this._base_url = process.env.base_url;
            }
        } else {
            this._base_url = process.env.base_url||"";
        }
        this._init = true;
    }
    public static get base_url() {
        return this._base_url;
    }

}
