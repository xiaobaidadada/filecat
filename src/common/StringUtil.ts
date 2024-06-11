
export class StringUtil {
    public static  trim(str) {
        if (!str) return "";
        return str.replace(" ", "");
    }

    public static trimList(list,index) {
        const one = list[index];
        return this.trim(one);
    }
}