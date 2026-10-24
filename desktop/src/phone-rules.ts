import type os from "os";

/*
 * Who the phone remote answers, and on which address. No Electron here, so Vitest can test it.
 */

const isPrivate = (ip: string): boolean => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip);

interface IRequestFacts {
    host: string | undefined;
    origin: string | undefined;
    remoteIp: string;
}

/**
 * Why a request is refused (a status), or 0 if it may go on. The Host must be this computer's
 * address (against DNS rebinding), the caller on a private network, and a page's Origin our own.
 */
export const refusalFor = ({ host, origin, remoteIp }: IRequestFacts, served: string): number => {
    if (host !== served) return 421;
    if (!isPrivate(remoteIp)) return 403;
    return origin && origin !== `http://${served}` ? 403 : 0;
};

export interface IPhoneAddress {
    address: string;
    /** The adapter's name, e.g. "Ethernet" or "Wi-Fi". */
    name: string;
}

/* Adapters a phone can't come in through: virtual switches, VPN tunnels, Bluetooth and the like. */
const unreachable =
    /vethernet|hyper-v|virtualbox|vmware|wsl|docker|vpn|wireguard|tailscale|zerotier|nordlynx|bluetooth|loopback|^(tun|tap|utun|wg)\d*$/i;

/** Home routers mostly hand out 192.168.x.x, then 10.x.x.x; 172.16–31 is often a virtual network. */
const rank = (address: string): number => (address.startsWith("192.168.") ? 0 : address.startsWith("10.") ? 1 : 2);

/**
 * The private IPv4 addresses among `interfaces` a phone could reach (Wi-Fi or Ethernet), best
 * first. If every adapter looks virtual, all the private ones are offered rather than none.
 */
export const homeAddresses = (interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): IPhoneAddress[] => {
    const all = Object.entries(interfaces).flatMap(([name, nets]) =>
        (nets ?? [])
            .filter((net) => net.family === "IPv4" && !net.internal && isPrivate(net.address))
            .filter((net) => !net.address.startsWith("169.254."))
            .map((net) => ({ address: net.address, name })),
    );
    const real = all.filter((entry) => !unreachable.test(entry.name));
    return (real.length > 0 ? real : all).sort((a, b) => rank(a.address) - rank(b.address));
};
