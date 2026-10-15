import {DdnsProvider} from "../../../../common/req/ddns.pojo";
import {DdnsUpdater} from "../ddns.provider";
import {DnspodUpdater} from "./dnspod.provider";
import {TengxunUpdater} from "./tengxun.provider";
import {AliUpdater} from "./ali.provider";
import {CloudflareUpdater} from "./cloudflare.provider";
import {GodaddyUpdater} from "./godaddy.provider";
import {NamesiloUpdater} from "./namesilo.provider";
import {NamecheapUpdater} from "./namecheap.provider";
import {VercelUpdater} from "./vercel.provider";
import {DuckdnsUpdater, Dynv6Updater, FreednsUpdater} from "./token_dns.provider";
import {DynUpdater, EasydnsUpdater, NoipUpdater, OrayUpdater} from "./dyn_dns.provider";
import {CustomUpdater} from "./http_ddns.provider";

// 所有平台的更新器实例（无状态，可复用）
const updaters: DdnsUpdater[] = [
    new DnspodUpdater(),
    new TengxunUpdater(),
    new AliUpdater(),
    new CloudflareUpdater(),
    new GodaddyUpdater(),
    new NamesiloUpdater(),
    new NamecheapUpdater(),
    new VercelUpdater(),
    new DuckdnsUpdater(),
    new Dynv6Updater(),
    new FreednsUpdater(),
    new NoipUpdater(),
    new EasydnsUpdater(),
    new OrayUpdater(),
    new DynUpdater(),
    new CustomUpdater(),
];

const updater_map = new Map<DdnsProvider, DdnsUpdater>();
for (const item of updaters) {
    updater_map.set(item.provider, item);
}

/** 按平台类型取更新器，不存在返回 undefined */
export function get_updater(provider: DdnsProvider): DdnsUpdater | undefined {
    return updater_map.get(provider);
}
