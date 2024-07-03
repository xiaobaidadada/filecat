import { Duplex} from "stream";

/**
 * basic tuntap interface
 * Duplex 可读可写流
 */
 export interface TuntapI extends Duplex {
    /**
     * the name of this tun/tap device. 
     * This will be generated.
     * @type {string}
     * @memberof TuntapI
     * @since 0.0.1
     */
    
    readonly name: string;
    /**
     * returns `true` if this is a Tap device
     * @type {boolean}
     * @memberof TuntapI
     * @since 0.0.1
     */
    readonly isTap: boolean;
    /**
     * returns `true` if this is a Tun device
     * @type {boolean}
     * @memberof TuntapI
     * @since 0.0.1
     */
    readonly isTun: boolean;
    /**
     * the mac address of this interface
     * @example
     * ```js
     * this.mac = '00:11:22:33:44:55';
     * ```
     * @type {string}
     * @memberof TuntapI
     * @since 0.1.1
     */
    mac: string;
    /**
     * mtu of this interface
     * @example
     * ```js
     * this.mtu = 1500;
     * ```
     * @type {number}
     * @memberof TuntapI
     * @since 0.0.1
     */
    mtu: number;
    /**
     * ipv4 address/subnet in cidr format of this interface
     * @example
     * ```js
     * this.ipv4='127.0.0.1/24';
     * ```
     * @type {string}
     * @memberof TuntapI
     * @since 0.0.1
     */
    ipv4: string;
    /**
     * ipv6 address/subnet in cidr format of this interface
     * @example
     * ```js
     * this.ipv6='abcd:0:1::/64';
     * ```
     * @type {string}
     * @memberof TuntapI
     * @since 0.0.1
     */
    ipv6: string;
    /**
     * get/set the interface to up/down status
     * @example
     * ```js
     * this.isUp = true; //set this interface up
     * ```
     * @type {boolean}
     * @memberof TuntapI
     * @since 0.0.1
     */
    isUp: boolean;
    /**
     * release this interface
     * @memberof TuntapI
     */
    release: ()=>void;
}
