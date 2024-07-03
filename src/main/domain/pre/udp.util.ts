import {TcpUtil} from "./tcp.util";

export class UdpUtil {

    checkUdp(point,sucess?:()=>void|null,fail?:()=>void|null):void {
        try {
            if (!point) {
                if (fail) {
                    fail();
                }
                return;
            }
            const address = point.address(); // 会报错
            if (address && address.port) {
                if (sucess) {
                    sucess();
                }
            }
        } catch (e) {
            if (fail) {
                fail();
            }
        }
    }
}
