
export class Param {
    key:string;
    value?:any;
}

export class StringUtil {
    public static  trim(str) {
        if (!str) return "";
        return str.replace(" ", "");
    }

    public static trimList(list,index) {
        const one = list[index];
        return this.trim(one);
    }

    public static getParam(...vs:Param[]) {
        let r = "?";
        let h = false;
        if (Array.isArray(vs)) {
            for (const item of vs) {
                if (item.value) {
                    if (h) {
                        r+=`&${item.key}=${item.value}`;
                    } else {
                        r+=`${item.key}=${item.value}`;
                        h = true;
                    }
                }
            }
        }
        return r;
    }
}
