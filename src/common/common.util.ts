

export class CommonUtil {
    public static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
