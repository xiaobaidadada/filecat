
import {Tuntap} from './ts/linux/Tuntap'
import WintunAddon from "./ts/win/WintunAddon";
// this file only contains wrapper class for tuntap class.
/**
 * Tun interface, a Layer 2 virtual interface.
 * @class LinuxTun
 * @extends {TuntapB}
 */
 class LinuxTun extends Tuntap {
    constructor() {
        super('tun');
    }
    /**
     * setting the mac of a Tun interface is illegal as tun devices is running on layer 3
     * @throws 'method not support by a tun device.'
     * @memberof LinuxTun
     * @since 0.1.0
     */
    set mac(mac:string){
        throw new Error('method not support by a tun device.');
    }
}

/**
 * Tap interface, a Layer 2 virtual interface.
 * The tap device allows
 * @class LinuxTap
 * @extends {TuntapB}
 */
 class LinuxTap extends Tuntap {
    constructor() {
        super('tap');
    }
}


const LinuxTunTap = function(options: any){
    if(options.name){
        throw `setting a name of a tuntap device is not supported`
    }
    if(options.type!='tun' && options.type != 'tap'){
        throw `illegal type ${options.type}`
    }
    const device = new Tuntap(options.type);
    if(options.mtu){
        device.mtu = options.mtu;
    }
    let mask = 32;
    if(options.mask){
        const maskSplited = options.mask.split('.');
        if(maskSplited.length!=4){
            throw `illegal net mask!`
        }
        mask = 0;
        maskSplited.forEach(((segment: string) => {
            let numberSegment = parseInt(segment) & 0xff;
            let hasOne = false;
            for(let i=0;i<8;i++){
                if(numberSegment&0x01){
                    hasOne = true;
                    mask++;
                }
                else{
                    if(hasOne==true){
                        throw `illegal netmask`;
                    }
                }
                numberSegment = numberSegment>>1;
            }
        }));
    }
    if(options.addr){
        let addr = [options.addr, mask].join('/');
        device.ipv4 = addr;
    }

    if(options.up){
        device.isUp = true;
    }
    return device;
}

const Wintun = WintunAddon ;

export {LinuxTap, LinuxTun, LinuxTunTap,Wintun};
