import * as path from "node:path";
import {sysType} from "../../../../shell/shell.service";
const { createRequire } = require('node:module');
export const require_c = createRequire(__filename);

export interface tuntap2AddonTypes {
    /**
     * set up the file descriptor to be as an tun/tap device.
     * @memberof tuntap2AddonTypes
     */
    tuntapInit: (fd: number, isTap: boolean) => string;
    /**
     *
     * get `ifr_flags` of the interface.
     * @memberof tuntap2AddonTypes
     */
    tuntapGetFlags: (name: string) => number;
    /**
     * set mac address of the tuntap device
     * @memberof tuntap2AddonTypes
     */
    tuntapSetMac: (name: string, mac: string) => number;
    /**
     * set the status of the network interface as Up
     * @memberof tuntap2AddonTypes
     */
    tuntapSetUp: (name: string) => number;
    /**
     *
     * set the status of the network interface to down
     * @memberof tuntap2AddonTypes
     */
    tuntapSetDown: (name: string) => number;
    /**
     *
     * set the mtu of the network interface
     * @memberof tuntap2AddonTypes
     */
    tuntapSetMtu: (name: string, mtu: number) => number;
    /**
     *
     * get the mtu of the network interface
     * @memberof tuntap2AddonTypes
     */
    tuntapGetMtu: (name: string) => number;
    /**
     *
     * set ipv4 address and netmask of the networkinterface
     * @memberof tuntap2AddonTypes
     * @param {string} name
     * @param {string} ipStr ip address in dotted decimal notation
     * @param {number} netmask prefix length
     * @example
     * ```js
     * tuntapSetIpv4('tun0','192.168.0.1',24);
     * //set tun0 ipv4 address 192.168.0.1 and mask 255.255.255.0
     * ```
     */
    tuntapSetIpv4: (name: string, ipStr: string, netmask: number) => number;
    /**
     * get the if index of this device in system
     * @see SIOCGIFINDEX
     * @memberof tuntap2AddonTypes
     */
    tuntapGetIfIndex: (name: string) => number;
    /**
     *
     * set ipv6 address and netmask of the networkinterface
     * @memberof tuntap2AddonTypes
     * @param {string} name
     * @param {string} ipStr see `inet_pton` for more info
     * @param {number} prefix prefix length
     */
    tuntapSetIpv6: (ifIndex: number, ipStr: string, prefix: number) => number;
}


const Tuntap2Addon: tuntap2AddonTypes = sysType==='linux'?require_c(path.join(__dirname,"linuxtun.node")):null;
export default Tuntap2Addon;
